import {
  type AgentOpinion,
  type AgentTeamConfig,
  type TeamExecutionInput,
  type TeamExecutionResult,
  type TeamMember,
  type ResearchReport,
  type KLineData,
  type Indicators,
} from '@trading-agent/shared';
import {
  callAgentForOpinion,
  GenericSupervisorOutputSchema,
  type GenericSupervisorOutput,
} from '../workflows/collaboration-engine';
import { getTeamConfig } from './team-config-store';
import { getTeamSharedMemory } from './team-shared-memory';
import { initReportStore, saveReport } from '../reports/report-store';
import { getMarketData } from '../tools/market-data-tool';
import { calculateIndicators } from '../tools/technical-analysis-tool';

/**
 * Agent Team 执行引擎
 *
 * 泛化协作引擎，支持通用任务执行。
 * 根据团队配置的协作模式编排 agent 调用，产出结构化结果。
 */

interface MastraLike {
  getAgent(name: string): any;
}

/** 构建通用任务上下文 */
function buildTaskContext(task: string, target?: string, extraContext?: string, sharedContext?: string): string {
  const parts: string[] = [];
  if (target) parts.push(`目标: ${target}`);
  parts.push(`任务: ${task}`);
  if (sharedContext) parts.push(`共享上下文:\n${sharedContext}`);
  if (extraContext) parts.push(`额外信息:\n${extraContext}`);
  return parts.join('\n\n');
}

/** 获取投研场景的市场数据上下文 */
async function getResearchMarketContext(
  symbol: string,
): Promise<{ latestPrice: number; klines: KLineData[]; indicators: Indicators }> {
  const result = await getMarketData(symbol, '3mo');
  const indicators = calculateIndicators(result.klines as KLineData[]);
  return {
    latestPrice: result.latestPrice,
    klines: result.klines,
    indicators,
  };
}

/** 构建投研场景的数据上下文 */
function buildResearchDataContext(symbol: string, latestPrice: number, indicators: Indicators): string {
  const n = {
    ma20: Number(indicators.ma20.toFixed(2)),
    ma60: Number(indicators.ma60.toFixed(2)),
    rsi: Number(indicators.rsi.toFixed(2)),
    macd: Number(indicators.macd.toFixed(4)),
    macdSignal: Number(indicators.macdSignal.toFixed(4)),
    macdHistogram: Number(indicators.macdHistogram.toFixed(4)),
  };
  return `标的: ${symbol}
最新收盘价: $${latestPrice.toFixed(2)}
MA20: ${n.ma20}
MA60: ${n.ma60}
RSI(14): ${n.rsi}
MACD: ${n.macd}
MACD Signal: ${n.macdSignal}
MACD Histogram: ${n.macdHistogram}`;
}

// ── 通用 Supervisor 调用 ─────────────────────────────────────────────

/** 调用 supervisor 汇总观点（通用模式，非投研特定） */
async function callGenericSupervisor(
  mastra: MastraLike,
  supervisorAgentId: string,
  task: string,
  target: string | undefined,
  opinions: AgentOpinion[],
  members: TeamMember[],
  teamInstructions?: string,
  sharedMemoryContext?: string,
): Promise<GenericSupervisorOutput> {
  const supervisor = mastra.getAgent(supervisorAgentId);
  if (!supervisor) {
    throw new Error(`Supervisor agent "${supervisorAgentId}" not found`);
  }

  const prompt = `请对以下任务进行综合研判，产出结构化结论。

任务: ${task}
${target ? `目标: ${target}` : ''}

各成员分析结果：
${opinions.map((o, i) => `### ${i + 1}. ${o.role} (权重: ${members[i]?.weight ?? 1})${members[i]?.side ? ` [${members[i].side}]` : ''}
- 倾向: ${o.signal ?? '未明确'}
- 信心度: ${o.confidence ?? '未明确'}
- 摘要: ${o.summary}
- 详情: ${o.details}`).join('\n\n')}

${sharedMemoryContext ? `\n团队历史记忆:\n${sharedMemoryContext}\n` : ''}

请基于以上各成员分析，融合各方观点，产出综合结论。要求：
1. conclusion 必须融合各方观点，不能只采纳一方判断
2. 如果各方观点矛盾，要在 conclusion 中说明分歧并给出你的综合判断
3. confidence 反映你对综合结论的把握（0-1）
4. risks 列出主要风险项
5. 所有文本内容用中文撰写`;

  const fullPrompt = [
    teamInstructions && `## 团队指令\n${teamInstructions}`,
    prompt,
  ].filter(Boolean).join('\n\n');

  const result = await supervisor.generate(fullPrompt, {
    maxSteps: 12,
    structuredOutput: { schema: GenericSupervisorOutputSchema },
  });

  const output = result.object as GenericSupervisorOutput | undefined;
  if (!output) {
    throw new Error('Supervisor returned no structured output');
  }
  return output;
}

// ── 协作模式实现（通用版本） ──────────────────────────────────────────

/** Council 模式 — 圆桌会议（通用） */
async function executeCouncilGeneric(
  mastra: MastraLike,
  members: TeamMember[],
  supervisorAgentId: string | undefined,
  taskContext: string,
  task: string,
  target: string | undefined,
  teamInstructions?: string,
): Promise<{ opinions: AgentOpinion[]; supervisorOutput: GenericSupervisorOutput | null }> {
  // 并行调用所有参与 agent
  const opinions = await Promise.all(
    members.map(async (member) => {
      try {
        return await callAgentForOpinion(
          mastra,
          member.agentId,
          `请基于以下信息完成你的分析任务。\n\n${taskContext}\n\n请从你的专业角度给出分析观点。`,
          { teamInstructions },
        );
      } catch (error) {
        console.warn(`[Team:Council] Agent "${member.agentId}" failed:`, error instanceof Error ? error.message : String(error));
        return {
          role: member.alias ?? member.agentId,
          summary: `${member.agentId} 分析失败`,
          details: `Agent 调用失败: ${error instanceof Error ? error.message : String(error)}`,
          signal: 'WATCH' as const,
          confidence: 0.1,
        };
      }
    }),
  );

  // Supervisor 汇总
  let supervisorOutput: GenericSupervisorOutput | null = null;
  if (supervisorAgentId) {
    try {
      supervisorOutput = await callGenericSupervisor(mastra, supervisorAgentId, task, target, opinions, members, teamInstructions);
    } catch (error) {
      console.warn('[Team:Council] Supervisor failed:', error instanceof Error ? error.message : String(error));
    }
  }

  return { opinions, supervisorOutput };
}

/** Pipeline 模式 — 流水线（通用） */
async function executePipelineGeneric(
  mastra: MastraLike,
  members: TeamMember[],
  supervisorAgentId: string | undefined,
  taskContext: string,
  task: string,
  target: string | undefined,
  teamInstructions?: string,
  passThroughContext: boolean = true,
): Promise<{ opinions: AgentOpinion[]; supervisorOutput: GenericSupervisorOutput | null }> {
  const sortedMembers = [...members].sort((a, b) => a.order - b.order);
  const opinions: AgentOpinion[] = [];
  let upstreamContext = taskContext;

  for (const member of sortedMembers) {
    try {
      const prompt = `请基于以下信息完成你的分析任务。\n\n${upstreamContext}\n\n请从你的专业角度给出分析观点。`;
      const opinion = await callAgentForOpinion(mastra, member.agentId, prompt, { teamInstructions });
      opinions.push(opinion);

      if (passThroughContext) {
        upstreamContext = `${taskContext}\n\n## 上游分析结果\n${opinions.map(o => `### ${o.role}\n- 倾向: ${o.signal ?? '未明确'}\n- 摘要: ${o.summary}\n- 详情: ${o.details}`).join('\n\n')}`;
      }
    } catch (error) {
      console.warn(`[Team:Pipeline] Agent "${member.agentId}" failed:`, error instanceof Error ? error.message : String(error));
      opinions.push({
        role: member.alias ?? member.agentId,
        summary: `${member.agentId} 分析失败`,
        details: `Agent 调用失败: ${error instanceof Error ? error.message : String(error)}`,
        signal: 'WATCH',
        confidence: 0.1,
      });
    }
  }

  let supervisorOutput: GenericSupervisorOutput | null = null;
  if (supervisorAgentId) {
    try {
      supervisorOutput = await callGenericSupervisor(mastra, supervisorAgentId, task, target, opinions, members, teamInstructions);
    } catch (error) {
      console.warn('[Team:Pipeline] Supervisor failed:', error instanceof Error ? error.message : String(error));
    }
  }

  return { opinions, supervisorOutput };
}

/** Debate 模式 — 辩论（通用） */
async function executeDebateGeneric(
  mastra: MastraLike,
  members: TeamMember[],
  supervisorAgentId: string | undefined,
  taskContext: string,
  task: string,
  target: string | undefined,
  teamInstructions?: string,
  rounds: number = 1,
): Promise<{ opinions: AgentOpinion[]; supervisorOutput: GenericSupervisorOutput | null }> {
  // 按 side 分组，如果没有 side 则按 order 前后分
  const bullMembers = members.filter(m => m.side === 'bull');
  const bearMembers = members.filter(m => m.side === 'bear');
  const neutralMembers = members.filter(m => !m.side || m.side === 'neutral');

  // 如果没有明确 side，按前后半分
  let actualBull = bullMembers;
  let actualBear = bearMembers;
  if (bullMembers.length === 0 && bearMembers.length === 0) {
    const midpoint = Math.ceil(members.length / 2);
    actualBull = members.slice(0, midpoint);
    actualBear = members.slice(midpoint);
  }

  const allOpinions: AgentOpinion[] = [];

  for (let round = 0; round < rounds; round++) {
    const roundLabel = rounds > 1 ? `（第 ${round + 1} 轮）` : '';

    // 并行执行多空双方
    const [bullOpinions, bearOpinions] = await Promise.all([
      Promise.all(actualBull.map(async (member) => {
        try {
          return await callAgentForOpinion(
            mastra, member.agentId,
            `请作为看多方分析${roundLabel}。\n\n${taskContext}\n\n请从看多角度给出你的分析观点和证据。`,
            { teamInstructions },
          );
        } catch {
          return { role: member.alias ?? member.agentId, summary: '看多分析失败', details: 'Agent 调用失败', signal: 'BUY' as const, confidence: 0.1 };
        }
      })),
      Promise.all(actualBear.map(async (member) => {
        try {
          return await callAgentForOpinion(
            mastra, member.agentId,
            `请作为看空方分析${roundLabel}。\n\n${taskContext}\n\n请从看空角度给出你的分析观点和风险证据。`,
            { teamInstructions },
          );
        } catch {
          return { role: member.alias ?? member.agentId, summary: '看空分析失败', details: 'Agent 调用失败', signal: 'SELL' as const, confidence: 0.1 };
        }
      })),
    ]);

    allOpinions.push(...bullOpinions, ...bearOpinions);

    // 如果有 neutral 成员，他们也参与
    if (round === rounds - 1) {
      for (const member of neutralMembers) {
        try {
          const opinion = await callAgentForOpinion(
            mastra, member.agentId,
            `请作为中立观察者分析。\n\n${taskContext}\n\n请给出你的客观分析观点。`,
            { teamInstructions },
          );
          allOpinions.push(opinion);
        } catch {
          allOpinions.push({ role: member.alias ?? member.agentId, summary: '中立分析失败', details: 'Agent 调用失败', signal: 'WATCH' as const, confidence: 0.1 });
        }
      }
    }
  }

  let supervisorOutput: GenericSupervisorOutput | null = null;
  if (supervisorAgentId) {
    try {
      supervisorOutput = await callGenericSupervisor(
        mastra, supervisorAgentId, task, target, allOpinions, members, teamInstructions,
        `本次分析采用辩论模式（${rounds} 轮）：多空双方对抗分析。请综合裁决多空观点。`,
      );
    } catch (error) {
      console.warn('[Team:Debate] Supervisor failed:', error instanceof Error ? error.message : String(error));
    }
  }

  return { opinions: allOpinions, supervisorOutput };
}

/** Parallel Scan 模式 — 并行扫描（通用） */
async function executeParallelScanGeneric(
  mastra: MastraLike,
  teamConfig: AgentTeamConfig,
  task: string,
  targets: string[],
  teamInstructions?: string,
): Promise<TeamExecutionResult[]> {
  const results = await Promise.all(
    targets.map(async (target) => {
      try {
        const subInput: TeamExecutionInput = {
          teamId: teamConfig.id,
          task,
          target,
        };
        const result = await executeTeamTask(mastra, subInput, false);
        return result;
      } catch (error) {
        console.warn(`[Team:ParallelScan] Failed for ${target}:`, error instanceof Error ? error.message : String(error));
        return {
          teamId: teamConfig.id,
          teamName: teamConfig.name,
          task,
          target,
          pattern: teamConfig.collaboration.pattern,
          opinions: [],
          conclusion: `分析失败: ${error instanceof Error ? error.message : String(error)}`,
          createdAt: new Date().toISOString(),
        } as TeamExecutionResult;
      }
    }),
  );

  return results;
}

// ── 主入口 ────────────────────────────────────────────────────────────

/**
 * 执行 Agent Team 任务
 *
 * 根据团队配置的协作模式编排 agent 调用，产出结构化结果。
 *
 * @param mastra - Mastra 实例
 * @param input - 执行输入
 * @param persist - 是否持久化结果（parallel-scan 内部调用时设为 false 避免重复持久化）
 */
export async function executeTeamTask(
  mastra: MastraLike,
  input: TeamExecutionInput,
  persist: boolean = true,
): Promise<TeamExecutionResult> {
  // 确保报告表已初始化
  if (persist) await initReportStore();

  // 1. 加载 TeamConfig
  const teamConfig = await getTeamConfig(input.teamId);
  if (!teamConfig) {
    throw new Error(`Team "${input.teamId}" not found`);
  }

  // parallel-scan 模式特殊处理
  if (teamConfig.collaboration.pattern === 'parallel-scan') {
    const targets = input.targets ?? teamConfig.collaboration.targets ?? [input.target].filter(Boolean) as string[];
    if (targets.length === 0) {
      throw new Error('Parallel-scan mode requires at least one target');
    }
    const results = await executeParallelScanGeneric(mastra, teamConfig, input.task, targets, teamConfig.teamInstructions);
    // 返回第一个结果（API 层需要单个结果，多结果在前端处理）
    return results[0] ?? {
      teamId: teamConfig.id,
      teamName: teamConfig.name,
      task: input.task,
      pattern: 'parallel-scan',
      opinions: [],
      conclusion: '没有产出任何结果',
      createdAt: new Date().toISOString(),
    };
  }

  // 2. 解析成员和 supervisor
  const members = teamConfig.members;
  const supervisorAgentId = teamConfig.supervisorAgentId;

  // 3. 确定目标
  const target = input.target ?? teamConfig.defaultTarget;

  // 4. 构建任务上下文
  let taskContext: string;
  let researchMarketData: { latestPrice: number; indicators: Indicators } | null = null;

  // 如果是投研报告模式且有 target，尝试获取市场数据
  if (teamConfig.outputFormat === 'research-report' && target) {
    try {
      const marketData = await getResearchMarketContext(target);
      researchMarketData = { latestPrice: marketData.latestPrice, indicators: marketData.indicators };
      const dataCtx = buildResearchDataContext(target, marketData.latestPrice, marketData.indicators);
      taskContext = buildTaskContext(input.task, target, input.extraContext, teamConfig.sharedContext) + '\n\n## 市场数据\n' + dataCtx;
    } catch {
      // 市场数据获取失败，使用纯任务上下文
      taskContext = buildTaskContext(input.task, target, input.extraContext, teamConfig.sharedContext);
    }
  } else {
    taskContext = buildTaskContext(input.task, target, input.extraContext, teamConfig.sharedContext);
  }

  // 5. 获取共享 Memory（如启用）
  let sharedMemory: ReturnType<typeof getTeamSharedMemory> | undefined;
  if (teamConfig.sharedMemoryEnabled) {
    sharedMemory = getTeamSharedMemory(teamConfig.id);
  }

  // 6. 执行协作模式
  const pattern = teamConfig.collaboration.pattern;
  let opinions: AgentOpinion[] = [];
  let supervisorOutput: GenericSupervisorOutput | null = null;

  switch (pattern) {
    case 'council':
      ({ opinions, supervisorOutput } = await executeCouncilGeneric(
        mastra, members, supervisorAgentId, taskContext, input.task, target, teamConfig.teamInstructions,
      ));
      break;
    case 'pipeline':
      ({ opinions, supervisorOutput } = await executePipelineGeneric(
        mastra, members, supervisorAgentId, taskContext, input.task, target,
        teamConfig.teamInstructions, teamConfig.collaboration.passThroughContext,
      ));
      break;
    case 'debate':
      ({ opinions, supervisorOutput } = await executeDebateGeneric(
        mastra, members, supervisorAgentId, taskContext, input.task, target,
        teamConfig.teamInstructions, teamConfig.collaboration.rounds,
      ));
      break;
    case 'hierarchical':
      // Hierarchical 模式：supervisor 直接委派
      if (supervisorAgentId) {
        const supervisor = mastra.getAgent(supervisorAgentId);
        if (supervisor) {
          const prompt = `请对以下任务进行分析并委派你的子 agent。\n\n${taskContext}\n\n请委派子 agent 进行分析，然后汇总产出结构化结论。`;
          const fullPrompt = [
            teamConfig.teamInstructions && `## 团队指令\n${teamConfig.teamInstructions}`,
            prompt,
          ].filter(Boolean).join('\n\n');

      const result = await supervisor.generate(fullPrompt, {
        maxSteps: 15,
        structuredOutput: { schema: GenericSupervisorOutputSchema },
      });

          const output = result.object as GenericSupervisorOutput | undefined;
          if (output) {
            supervisorOutput = output;
            opinions = [{
              role: teamConfig.name,
              summary: output.title,
              details: output.conclusion,
              confidence: output.confidence,
            }];
          }
        }
      }
      break;
    default:
      throw new Error(`Unknown collaboration pattern: ${pattern}`);
  }

  // 7. 构建结果
  const now = new Date().toISOString();
  const result: TeamExecutionResult = {
    teamId: teamConfig.id,
    teamName: teamConfig.name,
    task: input.task,
    target,
    pattern,
    opinions,
    conclusion: supervisorOutput?.conclusion ?? opinions.map(o => `${o.role}: ${o.summary}`).join('\n'),
    confidence: supervisorOutput?.confidence,
    risks: supervisorOutput?.risks,
    trackingConditions: supervisorOutput?.trackingConditions,
    rawOutput: supervisorOutput ? undefined : opinions.map(o => o.details).join('\n\n'),
    createdAt: now,
  };

  // 8. 持久化
  if (persist) {
    // 投研报告模式：存入 report-store
    if (teamConfig.outputFormat === 'research-report' && target && researchMarketData) {
      const report: ResearchReport = {
        symbol: target,
        title: supervisorOutput?.title ?? `${target} 团队分析报告`,
        date: now.slice(0, 10),
        price: researchMarketData.latestPrice,
        opinions,
        risks: supervisorOutput?.risks ?? [],
        conclusion: result.conclusion,
        action: 'WATCH',
        confidence: result.confidence ?? 0.5,
        trackingConditions: supervisorOutput?.trackingConditions ?? [],
        pattern,
        teamId: teamConfig.id,
      };
      const savedReport = await saveReport(report);
      result.id = savedReport.id;
    }
  }

  return result;
}
