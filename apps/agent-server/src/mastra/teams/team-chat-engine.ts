import type { ResearchReport, AgentTeamConfig, TeamMember } from '@trading-agent/shared';
import { getTeamConfig } from './team-config-store';
import { getTeamSharedMemory } from './team-shared-memory';
import { getReport } from '../reports/report-store';
import { getAgentConfig } from '../agents/agent-registry';

/**
 * Team Chat 流式引擎
 *
 * 支持两种流式聊天模式：
 * 1. 报告追问 — 基于已有报告上下文流式回答用户追问（Phase 0）
 * 2. Supervisor 代理聊天 — 用户直接与 Supervisor Agent 对话（Phase 1）
 */

interface MastraLike {
  getAgent(name: string): any;
}

// ── 共享工具 ──────────────────────────────────────────────────────────

/** 构建报告上下文 prompt */
function buildReportContext(report: ResearchReport): string {
  const opinions = report.opinions?.length
    ? report.opinions
        .map(
          o =>
            `**${o.role}**: ${o.summary}\n  - 倾向: ${o.signal ?? 'N/A'}\n  - 信心度: ${o.confidence !== undefined ? `${(o.confidence * 100).toFixed(0)}%` : 'N/A'}\n  - 详情: ${o.details}`,
        )
        .join('\n\n')
    : '（无角色分析数据）';

  const risks = report.risks?.length
    ? report.risks.map(r => `- [${r.severity}] ${r.category}: ${r.description}`).join('\n')
    : '（无风险数据）';

  const tracking = report.trackingConditions?.length
    ? report.trackingConditions.map(t => `- ${t.metric}: ${t.threshold} → ${t.action}`).join('\n')
    : '（无跟踪条件）';

  return `## 当前报告上下文

**标的**: ${report.symbol}
**标题**: ${report.title}
**日期**: ${report.date}
**结论**: ${report.conclusion}
**建议**: ${report.action}
**信心度**: ${(report.confidence * 100).toFixed(0)}%

### 各角色分析
${opinions}

### 风险项
${risks}

### 跟踪条件
${tracking}`;
}

/** 解析 Agent 显示名称：alias > agentConfig.name > agentId */
async function resolveAgentName(member: TeamMember): Promise<string> {
  if (member.alias) return member.alias;
  const config = await getAgentConfig(member.agentId);
  return config?.name ?? member.agentId;
}

/** 构建 Team Chat 的 Supervisor system prompt */
async function buildTeamChatSystemPrompt(teamConfig: AgentTeamConfig): Promise<string> {
  // 异步解析所有成员的显示名称
  const memberNames = await Promise.all(
    teamConfig.members.map(async m => ({
      member: m,
      name: await resolveAgentName(m),
    })),
  );

  const memberList = memberNames
    .map(
      ({ member, name }) =>
        `- **${name}** (角色: ${member.role}, ID: \`${member.agentId}\`)` +
        (member.side ? ` [${member.side}]` : ''),
    )
    .join('\n');

  return `你是团队「${teamConfig.name}」的协调者。

## 团队描述
${teamConfig.description}

## 团队成员
以下是你可用的子 agent，通过委派调用它们：
${memberList}

## 协作模式
${teamConfig.collaboration.pattern}

${teamConfig.teamInstructions ? `## 团队指令\n${teamConfig.teamInstructions}` : ''}

${teamConfig.sharedContext ? `## 共享上下文\n${teamConfig.sharedContext}` : ''}

## 你的职责
1. 理解用户的需求
2. 根据需求委派合适的子 agent 进行分析
3. 收集子 agent 的分析结果
4. 融合各方观点，给出综合回答
5. 如果用户追问，基于已有上下文深入分析

## 注意事项
- 所有回复用中文
- 委派子 agent 时明确告知分析目标
- 综合结论要融合各方观点，不能只采纳一方
- 如果各方观点矛盾，说明分歧并给出你的判断`;
}

// ── Phase 0: 报告追问流式 ─────────────────────────────────────────────

/**
 * 报告追问 — 流式回复
 *
 * 基于已有报告上下文，让 Supervisor 流式回答用户追问。
 */
export async function streamReportFollowUp(
  mastra: MastraLike,
  reportId: string,
  message: string,
  history: { role: string; content: string }[],
): Promise<ReadableStream<Uint8Array>> {
  const report = await getReport(reportId);
  if (!report) throw new Error(`Report "${reportId}" not found`);

  // 尝试获取 team 配置以确定 supervisor
  const teamId = (report as ResearchReport).teamId;
  let supervisorAgentId = 'research-supervisor';

  if (teamId) {
    const teamConfig = await getTeamConfig(teamId);
    if (teamConfig?.supervisorAgentId) {
      supervisorAgentId = teamConfig.supervisorAgentId;
    }
  }

  const supervisor = mastra.getAgent(supervisorAgentId);
  if (!supervisor) throw new Error(`Supervisor agent "${supervisorAgentId}" not found`);

  const reportCtx = buildReportContext(report);

  // 构建对话历史
  const historyText =
    history.length > 0
      ? history.map(h => `${h.role === 'user' ? '用户' : '你'}: ${h.content}`).join('\n\n')
      : '';

  const fullPrompt = `${reportCtx}

${historyText ? `## 对话历史\n${historyText}\n\n` : ''}## 用户追问
${message}

请基于以上报告上下文回答用户的问题。回答要具体、有依据，引用报告中的数据或观点。用中文回复。`;

  const streamResult = await supervisor.stream(fullPrompt, {
    maxSteps: 8,
  });

  return streamResult.textStream;
}

// ── Phase 1: Supervisor 代理聊天 ──────────────────────────────────────

/**
 * Team Chat — Supervisor 代理流式聊天
 *
 * 用户消息直接发给 Supervisor Agent，Supervisor 自主决定是否委派子 agent。
 * 流式返回综合回复，包含委派过程。
 */
export async function streamTeamChat(
  mastra: MastraLike,
  teamId: string,
  message: string,
  threadId?: string,
): Promise<{
  stream: ReadableStream<Uint8Array>;
  agentId: string;
  agentName: string;
}> {
  const teamConfig = await getTeamConfig(teamId);
  if (!teamConfig) throw new Error(`Team "${teamId}" not found`);

  // 确定 Supervisor Agent
  const supervisorAgentId =
    teamConfig.supervisorAgentId ??
    teamConfig.members.find(m => m.role === 'leader')?.agentId ??
    teamConfig.members[0]?.agentId;

  if (!supervisorAgentId) {
    throw new Error('No supervisor agent available for this team');
  }

  const supervisor = mastra.getAgent(supervisorAgentId);
  if (!supervisor) throw new Error(`Supervisor agent "${supervisorAgentId}" not found`);

  // 构建系统 prompt
  const systemPrompt = await buildTeamChatSystemPrompt(teamConfig);

  // 解析 Supervisor 显示名称
  const supervisorConfig = await getAgentConfig(supervisorAgentId);
  const supervisorName = supervisorConfig?.name ?? 'Supervisor';

  // 准备 stream 选项
  const streamOptions: Record<string, unknown> = {
    maxSteps: 15,
  };

  // 如果启用了共享 Memory，注入 Memory 实例
  if (teamConfig.sharedMemoryEnabled && threadId) {
    const memory = getTeamSharedMemory(teamId);
    (streamOptions as any).memory = memory;
    (streamOptions as any).threadId = threadId;
    (streamOptions as any).resourceId = teamId;
  }

  // 注入 system prompt
  (streamOptions as any).instructions = systemPrompt;

  const streamResult = await supervisor.stream(message, streamOptions);

  return {
    stream: streamResult.textStream,
    agentId: supervisorAgentId,
    agentName: supervisorName,
  };
}
