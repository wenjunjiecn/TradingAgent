# Agent Team Chat 交互 — 实施计划

> **日期**: 2026-07-09
> **状态**: Draft
> **目标**: 将 Agent Team 从「表单提交 → 批量执行 → 跳转报告」的批处理模式，升级为支持流式 Chat 交互的对话模式，让用户能实时观察 Agent 推理过程、追问分析细节、动态引导分析方向。

---

## 一、现状分析

### 1.1 当前交互模式

Agent Team 当前是一个 **批处理（Batch）模型**：

```
用户填写表单（任务、目标、上下文）→ 点击「启动」→ POST /api/research/teams/:id/execute → 同步阻塞 → 返回 JSON 结果 → 跳转报告页
```

| 层面 | 现状 | 痛点 |
|------|------|------|
| **API** | `POST /api/research/teams/:id/execute` 同步阻塞 | 等待期间无反馈，只有 spinner |
| **执行引擎** | `executeTeamTask()` 内部用 `agent.generate()` 一次性调用 | Agent 中间推理过程不可见 |
| **前端** | `pages/teams/execute.tsx` 表单 → 加载 → 成功/失败 | 无法追问、无法干预、看不到各 Agent 逐步产出 |
| **协作模式** | Council/Pipeline/Debate 均「提交即跑完」 | Debate 多轮辩论无法实时观察，Pipeline 串行流转不可见 |

### 1.2 已有可复用基础设施

| 模块 | 现状 | 文件 |
|------|------|------|
| 单 Agent 流式 Chat | `useChat` from `@mastra/react` + SSE 流式协议 | `lib/ai-ui/chat/chat-provider.tsx` |
| Agent Chat 组件 | `AgentChat` + `Thread` + `ChatComposer` + `MessageList` | `domains/agents/components/agent-chat.tsx` |
| 流式 Chat Provider | `StreamChatProvider` 封装 `useChat`，暴露 messages/running/send context | `domains/agent-builder/contexts/stream-chat-provider.tsx` |
| Agent Stream 端点 | Mastra 内置 `POST /api/agents/:id/stream`（SSE） | Mastra 框架自动注册 |
| Team 执行引擎 | `executeTeamTask()` 支持 council/pipeline/debate/hierarchical/parallel-scan | `teams/team-execution-engine.ts` |
| Team 共享 Memory | `getTeamSharedMemory(teamId)` 返回 Mastra `Memory` 实例 | `teams/team-shared-memory.ts` |
| Team REST API | CRUD + execute 端点 | `api/team-routes.ts` |
| Team 前端页面 | 列表/编辑/执行页 | `pages/teams/` |

### 1.3 核心矛盾

单 Agent 已有完整流式 Chat 能力（`useChat` + `/api/agents/:id/stream` + `AgentChat` 组件），但多 Agent 团队却没有 — 执行引擎用 `agent.generate()` 而非 `agent.stream()`，前端用表单而非 Chat。

---

## 二、设计决策

| 决策点 | 结论 | 理由 |
|--------|------|------|
| 整体策略 | 三阶段递进：报告追问 → Supervisor 代理聊天 → 多 Agent 可视化流式 | 逐步验证用户需求，控制风险和投入 |
| Phase 0 方案 | 报告页底部嵌入追问 Chat | 改动最小，快速验证用户是否有对话需求 |
| Phase 1 方案 | Supervisor 代理聊天（复用单 Agent Chat 组件） | 投入产出比最高，天然支持流式和追问 |
| Phase 2 方案 | 多 Agent 并行/串行流式，按协作模式选择策略 | 终极形态，前端复杂度高，在 Phase 1 验证后投入 |
| Chat 与 Batch 共存 | 保留现有表单执行模式，Chat 作为新增入口 | 表单适合一次性任务，Chat 适合探索性分析 |
| Memory 策略 | Chat 模式复用 Team 共享 Memory（`sharedMemoryEnabled`） | 跨对话保留团队上下文 |
| Thread 管理 | 每个 Team Chat 会话使用独立 threadId（`team-{teamId}-chat-{uuid}`） | 隔离不同对话上下文 |

---

## 三、架构概览

### 3.1 目标架构

```
┌──────────────────────────────────────────────────────────────────────┐
│                         桌面端 (Electron)                              │
│                                                                       │
│  ┌────────────────┐  ┌──────────────────┐  ┌───────────────────────┐ │
│  │ Team 执行页     │  │ Team Chat 页     │  │ 报告页 + 追问 Chat    │ │
│  │ (现有, 保留)    │  │ (NEW, Phase 1/2) │  │ (NEW, Phase 0)        │ │
│  │ 表单→执行→结果  │  │ 流式对话          │  │ 报告 + 底部 Chat      │ │
│  └───────┬────────┘  └────────┬─────────┘  └──────────┬────────────┘ │
│          │                    │                       │              │
└──────────┼────────────────────┼───────────────────────┼──────────────┘
           │                    │                       │
           ▼                    ▼                       ▼
┌──────────────────────────────────────────────────────────────────────┐
│                      Agent Server (Mastra)                            │
│                                                                       │
│  ┌─────────────────┐  ┌─────────────────────┐  ┌──────────────────┐  │
│  │ Team Execute    │  │ Team Chat Stream    │  │ Report Follow-up │  │
│  │ API (existing)  │  │ API (NEW)           │  │ Stream API (NEW) │  │
│  │ POST /execute   │  │ POST /chat/stream   │  │ POST /follow-up  │  │
│  └────────┬────────┘  └──────────┬──────────┘  └────────┬─────────┘  │
│           │                      │                      │            │
│           ▼                      ▼                      ▼            │
│  ┌──────────────────────────────────────────────────────────────────┐│
│  │              Team Execution Engine (existing)                    ││
│  │  executeTeamTask() → agent.generate()                            ││
│  └──────────────────────────────────────────────────────────────────┘│
│                                                                       │
│  ┌──────────────────────────────────────────────────────────────────┐│
│  │              Team Chat Engine (NEW)                              ││
│  │  Phase 1: supervisor.stream() — 单流                             ││
│  │  Phase 2: multiAgentStream() — 多流合并                           ││
│  └──────────────────────────────────────────────────────────────────┘│
│                                                                       │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────────────────────┐  │
│  │ Report Store │  │ Team Config  │  │ Team Shared Memory         │  │
│  │ (existing)   │  │ Store        │  │ (existing)                 │  │
│  └──────────────┘  └──────────────┘  └────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────┘
```

### 3.2 三阶段交互流程对比

```
Phase 0 — 报告追问 Chat:
  [现有] 表单提交 → 批量执行 → 产出报告
  [新增] 报告页底部 → Chat 输入 → Supervisor(携带报告上下文).stream() → 流式回复

Phase 1 — Supervisor 代理聊天:
  用户 ──chat──► Supervisor Agent ──stream/generate──► 子 Agent 们
       ◄──stream──  综合回复（含委派过程）

Phase 2 — 多 Agent 可视化流式:
  Council/Debate: 用户 ──► [Agent A] [Agent B] [Agent C] ──并行 stream──► 各自可见
  Pipeline:       用户 ──► [Agent A] ──► [Agent B] ──► [Agent C] ──► [Supervisor] 串行 stream
```

---

## 四、Phase 0：报告追问 Chat

**目标**: 在投研报告页底部嵌入轻量 Chat 组件，允许用户基于报告内容追问 Supervisor。

**预计工时**: 1-2 天

### 4.1 新增文件

| # | 文件路径 | 职责 |
|---|---------|------|
| 1 | `apps/agent-server/src/mastra/api/team-chat-routes.ts` | Team Chat 流式 API 路由（Phase 0/1/2 共用） |
| 2 | `apps/agent-server/src/mastra/teams/team-chat-engine.ts` | Team Chat 执行引擎（流式） |
| 3 | `apps/desktop/src/renderer/pages/reports/components/ReportFollowUpChat.tsx` | 报告页追问 Chat 组件 |

### 4.2 修改文件

| 文件 | 变更 |
|------|------|
| `apps/agent-server/src/mastra/api/research-routes.ts` | 导入并注册 `teamChatRoutes` |
| `apps/desktop/src/renderer/pages/reports/[id].tsx`（或对应报告详情页） | 页面底部嵌入 `ReportFollowUpChat` |

### 4.3 具体任务

- [ ] **Step 0.1: 创建 `team-chat-engine.ts` — 流式追问核心**

  实现基于报告上下文的 Supervisor 流式回复：

  ```typescript
  // apps/agent-server/src/mastra/teams/team-chat-engine.ts

  import type { ResearchReport, AgentTeamConfig } from '@trading-agent/shared';
  import { getTeamConfig } from './team-config-store';
  import { getTeamSharedMemory } from './team-shared-memory';
  import { getReport } from '../reports/report-store';

  interface MastraLike {
    getAgent(name: string): any;
  }

  /** 构建报告上下文 prompt */
  function buildReportContext(report: ResearchReport): string {
    return `## 当前报告上下文

  **标的**: ${report.symbol}
  **标题**: ${report.title}
  **日期**: ${report.date}
  **结论**: ${report.conclusion}
  **建议**: ${report.action}
  **信心度**: ${report.confidence}

  ### 各角色分析
  ${report.opinions.map(o => `**${o.role}**: ${o.summary}\n  - 倾向: ${o.signal ?? 'N/A'}\n  - 详情: ${o.details}`).join('\n\n')}

  ### 风险项
  ${(report.risks ?? []).map(r => `- [${r.severity}] ${r.category}: ${r.description}`).join('\n')}

  ### 跟踪条件
  ${(report.trackingConditions ?? []).map(t => `- ${t.metric}: ${t.threshold} → ${t.action}`).join('\n')}
  `;
  }

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
    const teamId = (report as any).teamId;
    let supervisorAgentId = 'research-supervisor'; // 默认 fallback

    if (teamId) {
      const teamConfig = await getTeamConfig(teamId);
      if (teamConfig?.supervisorAgentId) {
        supervisorAgentId = teamConfig.supervisorAgentId;
      }
    }

    const supervisor = mastra.getAgent(supervisorAgentId);
    if (!supervisor) throw new Error(`Supervisor agent "${supervisorAgentId}" not found`);

    const reportCtx = buildReportContext(report);
    const fullPrompt = `${reportCtx}\n\n## 用户追问\n${message}`;

    // 使用 Mastra agent.stream() 获取流式输出
    const streamResult = await supervisor.stream(fullPrompt, {
      maxSteps: 8,
    });

    return streamResult.textStream;
  }
  ```

- [ ] **Step 0.2: 创建 `team-chat-routes.ts` — 流式 API 路由**

  ```typescript
  // apps/agent-server/src/mastra/api/team-chat-routes.ts

  import type { ApiRoute } from '@mastra/core/server';
  import { streamReportFollowUp } from '../teams/team-chat-engine';

  /** 报告追问流式端点 */
  const reportFollowUpStreamRoute: ApiRoute = {
    path: '/research/reports/:id/follow-up/stream',
    method: 'POST',
    handler: async (c: any) => {
      try {
        const reportId = c.req.param('id');
        const { message, history } = await c.req.json();

        if (!message) {
          return c.json({ error: 'Message is required' }, 400);
        }

        const stream = await streamReportFollowUp(
          c.get('mastra'),
          reportId,
          message,
          history ?? [],
        );

        return new Response(stream, {
          headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
          },
        });
      } catch (error) {
        console.error('[Report Follow-up Stream API] Error:', error);
        const message = error instanceof Error ? error.message : String(error);
        return c.json({ error: message }, 500);
      }
    },
  };

  export const teamChatRoutes: ApiRoute[] = [
    reportFollowUpStreamRoute,
  ];
  ```

- [ ] **Step 0.3: 注册路由到 `research-routes.ts`**

  在 `researchRoutes` 数组中添加 `...teamChatRoutes`：

  ```typescript
  // apps/agent-server/src/mastra/api/research-routes.ts
  import { teamChatRoutes } from './team-chat-routes';

  export const researchRoutes: ApiRoute[] = [
    // ...existing routes...
    // Team Chat (streaming)
    ...teamChatRoutes,
  ];
  ```

- [ ] **Step 0.4: 创建 `ReportFollowUpChat.tsx` 前端组件**

  轻量 Chat 组件，不依赖完整 `ChatProvider`，直接 fetch SSE 流：

  ```typescript
  // apps/desktop/src/renderer/pages/reports/components/ReportFollowUpChat.tsx

  import { useState, useRef, useCallback } from 'react';
  import { Send, Loader2 } from 'lucide-react';
  import { Button } from '@mastra/playground-ui/components/Button';
  import { MarkdownRenderer } from '@mastra/playground-ui/components/MarkdownRenderer';

  interface ChatMessage {
    role: 'user' | 'assistant';
    content: string;
  }

  export function ReportFollowUpChat({ reportId }: { reportId: string }) {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState('');
    const [isStreaming, setIsStreaming] = useState(false);
    const abortRef = useRef<AbortController | null>(null);

    const handleSend = useCallback(async () => {
      const trimmed = input.trim();
      if (!trimmed || isStreaming) return;

      const userMsg: ChatMessage = { role: 'user', content: trimmed };
      setMessages(prev => [...prev, userMsg]);
      setInput('');
      setIsStreaming(true);

      // 添加空的 assistant 消息用于流式填充
      setMessages(prev => [...prev, { role: 'assistant', content: '' }]);

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const response = await fetch(`/api/research/reports/${reportId}/follow-up/stream`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: trimmed,
            history: messages.map(m => ({ role: m.role, content: m.content })),
          }),
          signal: controller.signal,
        });

        const reader = response.body?.getReader();
        const decoder = new TextDecoder();

        if (reader) {
          let accumulated = '';
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            accumulated += decoder.decode(value, { stream: true });
            // 更新最后一条 assistant 消息
            setMessages(prev => {
              const updated = [...prev];
              updated[updated.length - 1] = { role: 'assistant', content: accumulated };
              return updated;
            });
          }
        }
      } catch (err) {
        if (err instanceof Error && err.name !== 'AbortError') {
          setMessages(prev => {
            const updated = [...prev];
            updated[updated.length - 1] = {
              role: 'assistant',
              content: `⚠️ 请求失败: ${err.message}`,
            };
            return updated;
          });
        }
      } finally {
        setIsStreaming(false);
        abortRef.current = null;
      }
    }, [input, isStreaming, messages, reportId]);

    return (
      <div className="flex flex-col gap-3 border-t border-border1 pt-4">
        <h3 className="text-sm font-medium text-neutral4">追问与讨论</h3>

        {/* 消息列表 */}
        {messages.length > 0 && (
          <div className="max-h-96 space-y-3 overflow-y-auto">
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`rounded-lg p-3 text-sm ${
                  msg.role === 'user'
                    ? 'bg-accent1/10 ml-8 text-neutral5'
                    : 'bg-surface3 mr-8 text-neutral5'
                }`}
              >
                {msg.role === 'assistant' ? (
                  <MarkdownRenderer>{msg.content || '...'}</MarkdownRenderer>
                ) : (
                  msg.content
                )}
              </div>
            ))}
          </div>
        )}

        {/* 输入区 */}
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            rows={1}
            placeholder="基于此报告追问，如「风险部分能详细说说吗？」"
            className="flex-1 resize-none rounded border border-border1 bg-surface2 px-3 py-2 text-sm text-neutral5 placeholder:text-neutral4"
          />
          <Button
            onClick={handleSend}
            disabled={!input.trim() || isStreaming}
            size="sm"
          >
            {isStreaming ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Send className="size-4" />
            )}
          </Button>
        </div>
      </div>
    );
  }
  ```

- [ ] **Step 0.5: 在报告详情页嵌入追问组件**

  在报告详情页底部添加 `<ReportFollowUpChat reportId={report.id} />`。

- [ ] **Step 0.6: 编译验证**

  ```bash
  npm run build -w agent-server
  npm run build -w trading-agent
  ```

### 4.4 验收标准

- [ ] 报告详情页底部出现「追问与讨论」区域
- [ ] 输入问题后流式返回 Supervisor 回复
- [ ] 支持多轮追问（携带历史消息）
- [ ] 回复内容以 Markdown 渲染
- [ ] 不影响现有报告页功能

---

## 五、Phase 1：Supervisor 代理聊天

**目标**: 在 Team 执行页新增「Chat 模式」入口，用户直接与 Supervisor Agent 对话，Supervisor 后台委派子 Agent，流式返回综合回答。

**预计工时**: 3-5 天

### 5.1 设计原理

```
用户输入消息
     │
     ▼
┌─────────────────────────────────────────────────┐
│  Supervisor Agent (stream)                      │
│  system prompt = teamInstructions + 成员信息    │
│  agents = { sub-agent-1, sub-agent-2, ... }    │
│  memory = teamSharedMemory (如果启用)           │
│                                                 │
│  Supervisor 自主决定是否委派子 agent            │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐        │
│  │ Agent A │  │ Agent B │  │ Agent C │        │
│  └─────────┘  └─────────┘  └─────────┘        │
│       │             │             │             │
│       └─────────────┼─────────────┘             │
│                     ▼                           │
│  Supervisor 汇总 → 流式输出                     │
└─────────────────────────────────────────────────┘
     │
     ▼
  流式文本 + 工具调用过程（Mastra 自动在 stream 中包含）
```

**关键点**：Mastra 的 `agent.stream()` 天然支持工具调用和子 agent 委派的流式输出。Supervisor Agent 通过 Mastra `agents` 属性配置子 agent 后，`stream()` 会自动在流中携带委派过程和子 agent 的中间输出。

### 5.2 新增文件

| # | 文件路径 | 职责 |
|---|---------|------|
| 1 | `apps/desktop/src/renderer/pages/teams/chat.tsx` | Team Chat 页面 |
| 2 | `apps/desktop/src/renderer/lib/team-chat-api.ts` | Team Chat API hooks |

### 5.3 修改文件

| 文件 | 变更 |
|------|------|
| `apps/agent-server/src/mastra/teams/team-chat-engine.ts` | 新增 `streamTeamChat()` 函数 |
| `apps/agent-server/src/mastra/api/team-chat-routes.ts` | 新增 `teamChatStreamRoute` |
| `apps/desktop/src/renderer/App.tsx` | 新增 `/teams/:id/chat` 路由 |
| `apps/desktop/src/renderer/pages/teams/execute.tsx` | 顶部增加「Chat 模式」按钮 |
| `apps/desktop/src/renderer/pages/teams/index.tsx` | 团队卡片增加「Chat」入口 |
| `apps/desktop/src/renderer/lib/nav/nav-items.tsx` | 无变更（Chat 入口在 Team 内部） |

### 5.4 具体任务

- [ ] **Step 1.1: 扩展 `team-chat-engine.ts` — 添加 `streamTeamChat()`**

  ```typescript
  // apps/agent-server/src/mastra/teams/team-chat-engine.ts

  import { getTeamConfig } from './team-config-store';
  import { getTeamSharedMemory } from './team-shared-memory';
  import type { AgentTeamConfig, TeamMember } from '@trading-agent/shared';

  /** 构建 Team Chat 的 Supervisor system prompt */
  function buildTeamChatSystemPrompt(teamConfig: AgentTeamConfig): string {
    const memberList = teamConfig.members.map(m =>
      `- **${m.alias ?? m.agentId}** (角色: ${m.role}, ID: ${m.agentId})` +
      (m.side ? ` [${m.side}]` : ''),
    ).join('\n');

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
  }> {
    const teamConfig = await getTeamConfig(teamId);
    if (!teamConfig) throw new Error(`Team "${teamId}" not found`);

    // 确定 Supervisor Agent
    const supervisorAgentId = teamConfig.supervisorAgentId
      ?? teamConfig.members.find(m => m.role === 'leader')?.agentId
      ?? teamConfig.members[0]?.agentId;

    if (!supervisorAgentId) {
      throw new Error('No supervisor agent available for this team');
    }

    const supervisor = mastra.getAgent(supervisorAgentId);
    if (!supervisor) throw new Error(`Supervisor agent "${supervisorAgentId}" not found`);

    // 构建系统 prompt
    const systemPrompt = buildTeamChatSystemPrompt(teamConfig);

    // 准备 stream 选项
    const streamOptions: Record<string, unknown> = {
      maxSteps: 15,
    };

    // 如果启用了共享 Memory，注入 Memory 实例
    if (teamConfig.sharedMemoryEnabled && threadId) {
      const memory = getTeamSharedMemory(teamId);
      streamOptions.memory = memory;
      streamOptions.threadId = threadId;
    }

    // 注入 system prompt 通过 instructions
    streamOptions.instructions = systemPrompt;

    const streamResult = await supervisor.stream(message, streamOptions);

    return {
      stream: streamResult.textStream,
      agentId: supervisorAgentId,
    };
  }
  ```

- [ ] **Step 1.2: 扩展 `team-chat-routes.ts` — 添加 Team Chat Stream 端点**

  ```typescript
  // 在 team-chat-routes.ts 中新增

  import { streamTeamChat } from '../teams/team-chat-engine';

  /** Team Chat 流式端点 */
  const teamChatStreamRoute: ApiRoute = {
    path: '/research/teams/:id/chat/stream',
    method: 'POST',
    handler: async (c: any) => {
      try {
        const teamId = c.req.param('id');
        const { message, threadId } = await c.req.json();

        if (!message) {
          return c.json({ error: 'Message is required' }, 400);
        }

        const { stream } = await streamTeamChat(
          c.get('mastra'),
          teamId,
          message,
          threadId,
        );

        return new Response(stream, {
          headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
          },
        });
      } catch (error) {
        console.error('[Team Chat Stream API] Error:', error);
        const message = error instanceof Error ? error.message : String(error);
        return c.json({ error: message }, 500);
      }
    },
  };

  // 更新导出
  export const teamChatRoutes: ApiRoute[] = [
    reportFollowUpStreamRoute,
    teamChatStreamRoute,
  ];
  ```

- [ ] **Step 1.3: 创建 `team-chat-api.ts` — 前端 API Hooks**

  ```typescript
  // apps/desktop/src/renderer/lib/team-chat-api.ts

  import { useState, useCallback, useRef } from 'react';
  import { useQueryClient } from '@tanstack/react-query';

  export interface TeamChatMessage {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    isStreaming?: boolean;
  }

  /** Team Chat 流式对话 Hook */
  export function useTeamChatStream(teamId: string) {
    const [messages, setMessages] = useState<TeamChatMessage[]>([]);
    const [isStreaming, setIsStreaming] = useState(false);
    const [threadId] = useState(() => `team-${teamId}-chat-${crypto.randomUUID()}`);
    const abortRef = useRef<AbortController | null>(null);

    const send = useCallback(async (message: string) => {
      if (!message.trim() || isStreaming) return;

      const userMsg: TeamChatMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        content: message,
      };
      const assistantId = crypto.randomUUID();
      const assistantMsg: TeamChatMessage = {
        id: assistantId,
        role: 'assistant',
        content: '',
        isStreaming: true,
      };

      setMessages(prev => [...prev, userMsg, assistantMsg]);
      setIsStreaming(true);

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const response = await fetch(`/api/research/teams/${teamId}/chat/stream`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message, threadId }),
          signal: controller.signal,
        });

        const reader = response.body?.getReader();
        const decoder = new TextDecoder();

        if (reader) {
          let accumulated = '';
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            accumulated += decoder.decode(value, { stream: true });
            setMessages(prev =>
              prev.map(m =>
                m.id === assistantId
                  ? { ...m, content: accumulated }
                  : m,
              ),
            );
          }
        }

        setMessages(prev =>
          prev.map(m =>
            m.id === assistantId ? { ...m, isStreaming: false } : m,
          ),
        );
      } catch (err) {
        if (err instanceof Error && err.name !== 'AbortError') {
          setMessages(prev =>
            prev.map(m =>
              m.id === assistantId
                ? { ...m, content: `⚠️ 请求失败: ${err.message}`, isStreaming: false }
                : m,
            ),
          );
        }
      } finally {
        setIsStreaming(false);
        abortRef.current = null;
      }
    }, [teamId, threadId, isStreaming]);

    const cancel = useCallback(() => {
      abortRef.current?.abort();
      setIsStreaming(false);
    }, []);

    const clear = useCallback(() => {
      setMessages([]);
    }, []);

    return { messages, isStreaming, threadId, send, cancel, clear };
  }
  ```

- [ ] **Step 1.4: 创建 `pages/teams/chat.tsx` — Team Chat 页面**

  ```typescript
  // apps/desktop/src/renderer/pages/teams/chat.tsx

  import { Button } from '@mastra/playground-ui/components/Button';
  import { PageLayout } from '@mastra/playground-ui/components/PageLayout';
  import { MarkdownRenderer } from '@mastra/playground-ui/components/MarkdownRenderer';
  import { ArrowLeft, Send, Loader2, Users, Trash2 } from 'lucide-react';
  import { useTranslation } from 'react-i18next';
  import { useNavigate, useParams } from 'react-router';
  import { useTeamConfig } from '@/lib/team-api';
  import { useTeamChatStream } from '@/lib/team-chat-api';
  import { useRef, useEffect } from 'react';

  export default function TeamChatPage() {
    const { t } = useTranslation(['teams', 'common']);
    const { teamId } = useParams();
    const navigate = useNavigate();
    const { data: teamData, isLoading } = useTeamConfig(teamId ?? null);
    const team = teamData?.team;

    const { messages, isStreaming, send, cancel, clear } = useTeamChatStream(teamId ?? '');
    const [input, setInput] = useState('');
    const scrollRef = useRef<HTMLDivElement>(null);

    // 自动滚动到底部
    useEffect(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    }, [messages]);

    const handleSend = () => {
      const trimmed = input.trim();
      if (!trimmed || isStreaming) return;
      setInput('');
      send(trimmed);
    };

    if (isLoading || !team) {
      return <PageLayout className="p-4">{isLoading ? 'Loading...' : 'Team not found'}</PageLayout>;
    }

    return (
      <PageLayout className="flex h-full flex-col p-0">
        {/* 顶部栏 */}
        <div className="flex items-center justify-between border-b border-border1 p-4">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => navigate(`/teams/${teamId}/execute`)}>
              <ArrowLeft className="mr-1 size-4" />
              {t('teams:edit.back')}
            </Button>
            <div className="flex items-center gap-2">
              <Users className="size-4 text-accent1" />
              <h1 className="font-display text-lg font-bold text-neutral6">{team.name}</h1>
              <span className="rounded bg-accent1/10 px-1.5 py-0.5 text-xs text-accent1">Chat</span>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={clear} className="text-neutral3">
            <Trash2 className="size-3.5" />
          </Button>
        </div>

        {/* 成员提示 */}
        <div className="flex flex-wrap gap-1 border-b border-border1 px-4 py-2">
          {team.members.map(m => (
            <span key={m.agentId} className="rounded-full border border-border1 bg-surface2 px-2 py-0.5 text-xs text-neutral4">
              {m.alias ?? m.agentId}
            </span>
          ))}
          {team.supervisorAgentId && (
            <span className="rounded-full bg-accent1/10 px-2 py-0.5 text-xs text-accent1">
              Supervisor: {team.supervisorAgentId}
            </span>
          )}
        </div>

        {/* 消息列表 */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4">
          {messages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-neutral3">
              <Users className="size-8" />
              <p className="text-sm">向团队「{team.name}」发送消息开始对话</p>
              <p className="text-xs text-neutral4">Supervisor 会自动委派成员 Agent 协同分析</p>
            </div>
          ) : (
            <div className="mx-auto max-w-3xl space-y-4">
              {messages.map(msg => (
                <div
                  key={msg.id}
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[80%] rounded-lg p-3 text-sm ${
                      msg.role === 'user'
                        ? 'bg-accent1 text-white'
                        : 'bg-surface3 text-neutral5'
                    }`}
                  >
                    {msg.role === 'assistant' ? (
                      <MarkdownRenderer>{msg.content || '...'}</MarkdownRenderer>
                    ) : (
                      msg.content
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 输入区 */}
        <div className="border-t border-border1 p-4">
          <div className="mx-auto flex max-w-3xl items-end gap-2">
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              rows={1}
              placeholder="输入消息，如「分析 AAPL 的投资价值」..."
              className="flex-1 resize-none rounded-lg border border-border1 bg-surface2 px-3 py-2 text-sm text-neutral5 placeholder:text-neutral4 focus:border-accent1 focus:outline-none"
            />
            {isStreaming ? (
              <Button variant="outline" size="sm" onClick={cancel}>
                停止
              </Button>
            ) : (
              <Button size="sm" onClick={handleSend} disabled={!input.trim()}>
                <Send className="size-4" />
              </Button>
            )}
          </div>
        </div>
      </PageLayout>
    );
  }
  ```

- [ ] **Step 1.5: 添加路由和导航入口**

  在 `App.tsx` 添加路由：
  ```typescript
  <Route path="/teams/:teamId/chat" element={<TeamChatPage />} />
  ```

  在 `pages/teams/execute.tsx` 顶部增加 Chat 模式按钮：
  ```tsx
  <Button variant="outline" size="sm" onClick={() => navigate(`/teams/${teamId}/chat`)}>
    <MessageCircle className="mr-1 size-3.5" />
    Chat 模式
  </Button>
  ```

  在 `pages/teams/index.tsx` 团队卡片增加 Chat 按钮：
  ```tsx
  <Button variant="ghost" size="sm" onClick={() => navigate(`/teams/${team.id}/chat`)}>
    <MessageCircle className="mr-1 size-3.5" />
    Chat
  </Button>
  ```

- [ ] **Step 1.6: 编译验证**

  ```bash
  npm run build -w agent-server
  npm run build -w trading-agent
  ```

### 5.5 验收标准

- [ ] Team 执行页和列表页出现「Chat」入口
- [ ] Chat 页面支持输入消息、流式返回 Supervisor 回复
- [ ] Supervisor 回复中体现委派子 Agent 的过程
- [ ] 支持多轮对话（携带历史上下文）
- [ ] 如果 Team 启用了 sharedMemory，跨对话保留上下文
- [ ] 支持停止流式输出
- [ ] 支持清空对话
- [ ] 消息内容以 Markdown 渲染
- [ ] 不影响现有表单执行功能

---

## 六、Phase 2：多 Agent 可视化流式

**目标**: 支持多个 Agent 同时流式回复，按协作模式选择并行（Council/Debate）或串行（Pipeline）策略，用户能实时观察每个 Agent 的推理过程。

**预计工时**: 5-8 天

### 6.1 设计原理

#### Council/Debate — 并行流式

```
用户消息 ──► ┌─────────────────────────────────────────────┐
             │  并行发起多个 agent.stream()                 │
             │  ┌─────────┐ ┌─────────┐ ┌─────────┐       │
             │  │ Agent A │ │ Agent B │ │ Agent C │       │
             │  │ stream  │ │ stream  │ │ stream  │       │
             │  └────┬────┘ └────┬────┘ └────┬────┘       │
             │       │           │           │              │
             │  合并为单一 SSE 流，每条事件携带 agentId     │
             └─────────────────────┬───────────────────────┘
                                   ▼
             前端按 agentId 分组渲染，各 Agent 消息并排显示
                                   │
                                   ▼
             [可选] 所有 Agent 完成后，Supervisor 流式汇总
```

#### Pipeline — 串行流式

```
用户消息 ──► [Agent A].stream() ──► 完成
                 │ 上下文注入
                 ▼
             [Agent B].stream() ──► 完成
                 │ 上下文注入
                 ▼
             [Agent C].stream() ──► 完成
                 │
                 ▼
             [Supervisor].stream() ──► 综合报告

单个 SSE 流，按时间线依次输出各 Agent 的回复
```

### 6.2 新增文件

| # | 文件路径 | 职责 |
|---|---------|------|
| 1 | `apps/agent-server/src/mastra/teams/team-multi-stream.ts` | 多 Agent 流式合并引擎 |
| 2 | `apps/desktop/src/renderer/pages/teams/components/TeamMultiChatMessage.tsx` | 多 Agent 消息渲染组件 |
| 3 | `apps/desktop/src/renderer/pages/teams/components/AgentMessageBubble.tsx` | 单 Agent 消息气泡 |

### 6.3 修改文件

| 文件 | 变更 |
|------|------|
| `apps/agent-server/src/mastra/api/team-chat-routes.ts` | 新增 `teamMultiChatStreamRoute` |
| `apps/agent-server/src/mastra/teams/team-chat-engine.ts` | 新增 `streamMultiAgentChat()` |
| `apps/desktop/src/renderer/pages/teams/chat.tsx` | 支持「多 Agent 模式」切换 |
| `apps/desktop/src/renderer/lib/team-chat-api.ts` | 支持 SSE 事件解析（带 agentId） |

### 6.4 具体任务

- [ ] **Step 2.1: 创建 `team-multi-stream.ts` — 多 Agent 流式合并引擎**

  ```typescript
  // apps/agent-server/src/mastra/teams/team-multi-stream.ts

  import type { AgentTeamConfig, TeamMember, AgentOpinion } from '@trading-agent/shared';
  import { getTeamConfig } from './team-config-store';
  import { getTeamSharedMemory } from './team-shared-memory';

  interface MastraLike {
    getAgent(name: string): any;
  }

  /** SSE 事件类型 */
  interface StreamEvent {
    type: 'agent-start' | 'agent-delta' | 'agent-end' | 'supervisor-start' | 'supervisor-delta' | 'supervisor-end' | 'done' | 'error';
    agentId?: string;
    agentName?: string;
    content?: string;
    error?: string;
  }

  /** 将事件编码为 SSE 格式 */
  function encodeSSE(event: StreamEvent): string {
    return `data: ${JSON.stringify(event)}\n\n`;
  }

  /**
   * 并行多 Agent 流式聊天（Council/Debate 模式）
   *
   * 所有成员 Agent 同时 stream，合并为单一 SSE 流。
   * 完成后可选触发 Supervisor 汇总。
   */
  export async function streamParallelAgents(
    mastra: MastraLike,
    teamConfig: AgentTeamConfig,
    message: string,
    options?: {
      includeSupervisor?: boolean;
    },
  ): Promise<ReadableStream<Uint8Array>> {
    const encoder = new TextEncoder();
    const members = teamConfig.members;
    const includeSupervisor = options?.includeSupervisor ?? !!teamConfig.supervisorAgentId;

    return new ReadableStream<Uint8Array>({
      async start(controller) {
        const opinions: AgentOpinion[] = [];

        try {
          // 并行发起所有 Agent 的 stream
          const streamPromises = members.map(async (member) => {
            const agent = mastra.getAgent(member.agentId);
            if (!agent) {
              controller.enqueue(encoder.encode(encodeSSE({
                type: 'error',
                agentId: member.agentId,
                error: `Agent "${member.agentId}" not found`,
              })));
              return;
            }

            const agentName = member.alias ?? member.agentId;
            controller.enqueue(encoder.encode(encodeSSE({
              type: 'agent-start',
              agentId: member.agentId,
              agentName,
            })));

            try {
              const streamResult = await agent.stream(message, {
                maxSteps: 5,
                instructions: teamConfig.teamInstructions,
              });

              let fullText = '';
              for await (const chunk of streamResult.textStream) {
                fullText += chunk;
                controller.enqueue(encoder.encode(encodeSSE({
                  type: 'agent-delta',
                  agentId: member.agentId,
                  agentName,
                  content: chunk,
                })));
              }

              controller.enqueue(encoder.encode(encodeSSE({
                type: 'agent-end',
                agentId: member.agentId,
                agentName,
              })));

              opinions.push({
                role: agentName,
                summary: fullText.slice(0, 200),
                details: fullText,
                confidence: 0.5,
              });
            } catch (error) {
              controller.enqueue(encoder.encode(encodeSSE({
                type: 'error',
                agentId: member.agentId,
                error: error instanceof Error ? error.message : String(error),
              })));
            }
          });

          await Promise.all(streamPromises);

          // Supervisor 汇总
          if (includeSupervisor && teamConfig.supervisorAgentId && opinions.length > 0) {
            const supervisor = mastra.getAgent(teamConfig.supervisorAgentId);
            if (supervisor) {
              controller.enqueue(encoder.encode(encodeSSE({
                type: 'supervisor-start',
                agentId: teamConfig.supervisorAgentId,
                agentName: 'Supervisor',
              })));

              const summaryPrompt = `请综合以下各成员的分析，给出总结性结论：\n\n${
                opinions.map((o, i) => `### ${i + 1}. ${o.role}\n${o.details}`).join('\n\n')
              }`;

              const streamResult = await supervisor.stream(summaryPrompt, {
                maxSteps: 8,
              });

              for await (const chunk of streamResult.textStream) {
                controller.enqueue(encoder.encode(encodeSSE({
                  type: 'supervisor-delta',
                  agentId: teamConfig.supervisorAgentId,
                  agentName: 'Supervisor',
                  content: chunk,
                })));
              }

              controller.enqueue(encoder.encode(encodeSSE({
                type: 'supervisor-end',
                agentId: teamConfig.supervisorAgentId,
                agentName: 'Supervisor',
              })));
            }
          }

          controller.enqueue(encoder.encode(encodeSSE({ type: 'done' })));
        } catch (error) {
          controller.enqueue(encoder.encode(encodeSSE({
            type: 'error',
            error: error instanceof Error ? error.message : String(error),
          })));
        } finally {
          controller.close();
        }
      },
    });
  }

  /**
   * 串行多 Agent 流式聊天（Pipeline 模式）
   *
   * Agent 按 order 顺序依次 stream，上游结果注入下游 prompt。
   */
  export async function streamPipelineAgents(
    mastra: MastraLike,
    teamConfig: AgentTeamConfig,
    message: string,
  ): Promise<ReadableStream<Uint8Array>> {
    const encoder = new TextEncoder();
    const sortedMembers = [...teamConfig.members].sort((a, b) => a.order - b.order);

    return new ReadableStream<Uint8Array>({
      async start(controller) {
        let accumulatedContext = message;

        try {
          for (const member of sortedMembers) {
            const agent = mastra.getAgent(member.agentId);
            if (!agent) continue;

            const agentName = member.alias ?? member.agentId;
            controller.enqueue(encoder.encode(encodeSSE({
              type: 'agent-start',
              agentId: member.agentId,
              agentName,
            })));

            const prompt = teamConfig.collaboration.passThroughContext
              ? `${message}\n\n## 上游分析结果\n${accumulatedContext}`
              : message;

            const streamResult = await agent.stream(prompt, {
              maxSteps: 5,
              instructions: teamConfig.teamInstructions,
            });

            let fullText = '';
            for await (const chunk of streamResult.textStream) {
              fullText += chunk;
              controller.enqueue(encoder.encode(encodeSSE({
                type: 'agent-delta',
                agentId: member.agentId,
                agentName,
                content: chunk,
              })));
            }

            controller.enqueue(encoder.encode(encodeSSE({
              type: 'agent-end',
              agentId: member.agentId,
              agentName,
            })));

            accumulatedContext = fullText;
          }

          controller.enqueue(encoder.encode(encodeSSE({ type: 'done' })));
        } catch (error) {
          controller.enqueue(encoder.encode(encodeSSE({
            type: 'error',
            error: error instanceof Error ? error.message : String(error),
          })));
        } finally {
          controller.close();
        }
      },
    });
  }

  /**
   * 根据协作模式选择流式策略
   */
  export async function streamMultiAgentChat(
    mastra: MastraLike,
    teamId: string,
    message: string,
  ): Promise<ReadableStream<Uint8Array>> {
    const teamConfig = await getTeamConfig(teamId);
    if (!teamConfig) throw new Error(`Team "${teamId}" not found`);

    const pattern = teamConfig.collaboration.pattern;

    switch (pattern) {
      case 'council':
      case 'debate':
      case 'hierarchical':
        return streamParallelAgents(mastra, teamConfig, message);

      case 'pipeline':
        return streamPipelineAgents(mastra, teamConfig, message);

      case 'parallel-scan':
        // parallel-scan 在 Chat 模式下降级为 council
        return streamParallelAgents(mastra, teamConfig, message);

      default:
        return streamParallelAgents(mastra, teamConfig, message);
    }
  }
  ```

- [ ] **Step 2.2: 添加多 Agent 流式 API 端点**

  ```typescript
  // 在 team-chat-routes.ts 中新增

  import { streamMultiAgentChat } from '../teams/team-multi-stream';

  /** Team 多 Agent Chat 流式端点 */
  const teamMultiChatStreamRoute: ApiRoute = {
    path: '/research/teams/:id/multi-chat/stream',
    method: 'POST',
    handler: async (c: any) => {
      try {
        const teamId = c.req.param('id');
        const { message } = await c.req.json();

        if (!message) {
          return c.json({ error: 'Message is required' }, 400);
        }

        const stream = await streamMultiAgentChat(c.get('mastra'), teamId, message);

        return new Response(stream, {
          headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
          },
        });
      } catch (error) {
        console.error('[Team Multi Chat Stream API] Error:', error);
        const message = error instanceof Error ? error.message : String(error);
        return c.json({ error: message }, 500);
      }
    },
  };

  // 更新导出
  export const teamChatRoutes: ApiRoute[] = [
    reportFollowUpStreamRoute,
    teamChatStreamRoute,
    teamMultiChatStreamRoute,
  ];
  ```

- [ ] **Step 2.3: 扩展 `team-chat-api.ts` — 支持多 Agent SSE 解析**

  ```typescript
  // 新增 useTeamMultiChatStream hook

  export interface MultiAgentMessage {
    id: string;
    agentId: string;
    agentName: string;
    role: 'user' | 'assistant' | 'supervisor';
    content: string;
    isStreaming?: boolean;
  }

  export function useTeamMultiChatStream(teamId: string) {
    const [messages, setMessages] = useState<MultiAgentMessage[]>([]);
    const [isStreaming, setIsStreaming] = useState(false);
    const abortRef = useRef<AbortController | null>(null);

    const send = useCallback(async (message: string) => {
      if (!message.trim() || isStreaming) return;

      // 添加用户消息
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        agentId: 'user',
        agentName: 'You',
        role: 'user',
        content: message,
      }]);

      setIsStreaming(true);
      const controller = new AbortController();
      abortRef.current = controller;

      // 用于跟踪各 agent 的消息
      const agentMessages = new Map<string, MultiAgentMessage>();

      try {
        const response = await fetch(`/api/research/teams/${teamId}/multi-chat/stream`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message }),
          signal: controller.signal,
        });

        const reader = response.body?.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        if (reader) {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n\n');
            buffer = lines.pop() ?? '';

            for (const line of lines) {
              if (!line.startsWith('data: ')) continue;
              const data = JSON.parse(line.slice(6)) as StreamEvent;

              switch (data.type) {
                case 'agent-start':
                case 'supervisor-start': {
                  const id = crypto.randomUUID();
                  const msg: MultiAgentMessage = {
                    id,
                    agentId: data.agentId!,
                    agentName: data.agentName!,
                    role: data.type === 'supervisor-start' ? 'supervisor' : 'assistant',
                    content: '',
                    isStreaming: true,
                  };
                  agentMessages.set(data.agentId!, msg);
                  setMessages(prev => [...prev, msg]);
                  break;
                }
                case 'agent-delta':
                case 'supervisor-delta': {
                  const msg = agentMessages.get(data.agentId!);
                  if (msg) {
                    msg.content += data.content ?? '';
                    setMessages(prev =>
                      prev.map(m => m.id === msg.id ? { ...m, content: msg.content } : m),
                    );
                  }
                  break;
                }
                case 'agent-end':
                case 'supervisor-end': {
                  const msg = agentMessages.get(data.agentId!);
                  if (msg) {
                    msg.isStreaming = false;
                    setMessages(prev =>
                      prev.map(m => m.id === msg.id ? { ...m, isStreaming: false } : m),
                    );
                  }
                  break;
                }
                case 'done':
                  break;
                case 'error':
                  console.error('Stream error:', data.error);
                  break;
              }
            }
          }
        }
      } catch (err) {
        if (err instanceof Error && err.name !== 'AbortError') {
          setMessages(prev => [...prev, {
            id: crypto.randomUUID(),
            agentId: 'error',
            agentName: 'Error',
            role: 'supervisor',
            content: `⚠️ ${err.message}`,
          }]);
        }
      } finally {
        setIsStreaming(false);
        abortRef.current = null;
      }
    }, [teamId, isStreaming]);

    const cancel = useCallback(() => {
      abortRef.current?.abort();
      setIsStreaming(false);
    }, []);

    const clear = useCallback(() => setMessages([]), []);

    return { messages, isStreaming, send, cancel, clear };
  }
  ```

- [ ] **Step 2.4: 创建多 Agent 消息渲染组件**

  ```typescript
  // apps/desktop/src/renderer/pages/teams/components/AgentMessageBubble.tsx

  import { MarkdownRenderer } from '@mastra/playground-ui/components/MarkdownRenderer';
  import { Loader2 } from 'lucide-react';
  import type { MultiAgentMessage } from '@/lib/team-chat-api';

  const AVATAR_COLORS = [
    'bg-blue-500/10 text-blue-400',
    'bg-green-500/10 text-green-400',
    'bg-purple-500/10 text-purple-400',
    'bg-orange-500/10 text-orange-400',
    'bg-pink-500/10 text-pink-400',
  ];

  export function AgentMessageBubble({ message, index }: { message: MultiAgentMessage; index: number }) {
    const colorClass = AVATAR_COLORS[index % AVATAR_COLORS.length];
    const isSupervisor = message.role === 'supervisor';

    return (
      <div className={`flex gap-2 ${isSupervisor ? 'border-t border-border1 pt-3' : ''}`}>
        {/* Avatar */}
        <div className={`flex size-8 shrink-0 items-center justify-center rounded-full ${isSupervisor ? 'bg-accent1/10 text-accent1' : colorClass}`}>
          <span className="text-xs font-medium">
            {message.agentName.slice(0, 2).toUpperCase()}
          </span>
        </div>

        {/* Content */}
        <div className="flex-1">
          <div className="mb-1 flex items-center gap-2">
            <span className="text-xs font-medium text-neutral4">{message.agentName}</span>
            {isSupervisor && (
              <span className="rounded bg-accent1/10 px-1 py-0.5 text-[10px] text-accent1">Supervisor</span>
            )}
            {message.isStreaming && (
              <Loader2 className="size-3 animate-spin text-neutral3" />
            )}
          </div>
          <div className="rounded-lg bg-surface3 p-3 text-sm text-neutral5">
            <MarkdownRenderer>{message.content || '...'}</MarkdownRenderer>
          </div>
        </div>
      </div>
    );
  }
  ```

- [ ] **Step 2.5: 升级 `pages/teams/chat.tsx` — 支持模式切换**

  在 Chat 页面顶部增加「Supervisor 模式 / 多 Agent 模式」切换开关。Supervisor 模式用 `useTeamChatStream`，多 Agent 模式用 `useTeamMultiChatStream`。

  ```typescript
  // 核心切换逻辑
  const [chatMode, setChatMode] = useState<'supervisor' | 'multi'>('supervisor');
  const supervisorChat = useTeamChatStream(teamId);
  const multiChat = useTeamMultiChatStream(teamId);

  const activeChat = chatMode === 'supervisor' ? supervisorChat : multiChat;
  ```

- [ ] **Step 2.6: 编译验证**

  ```bash
  npm run build -w agent-server
  npm run build -w trading-agent
  ```

### 6.5 验收标准

- [ ] Chat 页面支持「Supervisor 模式」和「多 Agent 模式」切换
- [ ] 多 Agent 模式下，各 Agent 消息独立显示，带头像和名称
- [ ] Council/Debate 模式触发并行流式，各 Agent 同时回复
- [ ] Pipeline 模式触发串行流式，Agent 按顺序依次回复
- [ ] Supervisor 汇总消息有特殊样式标记
- [ ] 流式过程中各 Agent 消息实时更新
- [ ] 支持停止流式输出
- [ ] 不影响 Phase 1 的 Supervisor 代理聊天功能

---

## 七、文件变更清单

### 7.1 新增文件

| # | 文件路径 | Phase | 职责 |
|---|---------|-------|------|
| 1 | `apps/agent-server/src/mastra/teams/team-chat-engine.ts` | 0+1 | Team Chat 流式引擎（报告追问 + Supervisor 代理） |
| 2 | `apps/agent-server/src/mastra/api/team-chat-routes.ts` | 0+1+2 | Team Chat 流式 API 路由 |
| 3 | `apps/desktop/src/renderer/pages/reports/components/ReportFollowUpChat.tsx` | 0 | 报告页追问 Chat 组件 |
| 4 | `apps/desktop/src/renderer/pages/teams/chat.tsx` | 1+2 | Team Chat 页面 |
| 5 | `apps/desktop/src/renderer/lib/team-chat-api.ts` | 1+2 | Team Chat API hooks |
| 6 | `apps/agent-server/src/mastra/teams/team-multi-stream.ts` | 2 | 多 Agent 流式合并引擎 |
| 7 | `apps/desktop/src/renderer/pages/teams/components/AgentMessageBubble.tsx` | 2 | 多 Agent 消息气泡组件 |

### 7.2 修改文件

| # | 文件路径 | Phase | 变更 |
|---|---------|-------|------|
| 1 | `apps/agent-server/src/mastra/api/research-routes.ts` | 0 | 注册 `teamChatRoutes` |
| 2 | `apps/desktop/src/renderer/pages/reports/[id].tsx` | 0 | 嵌入 `ReportFollowUpChat` |
| 3 | `apps/agent-server/src/mastra/teams/team-chat-engine.ts` | 1 | 新增 `streamTeamChat()` |
| 4 | `apps/agent-server/src/mastra/api/team-chat-routes.ts` | 1+2 | 新增 `teamChatStreamRoute`、`teamMultiChatStreamRoute` |
| 5 | `apps/desktop/src/renderer/App.tsx` | 1 | 新增 `/teams/:id/chat` 路由 |
| 6 | `apps/desktop/src/renderer/pages/teams/execute.tsx` | 1 | 顶部增加 Chat 模式按钮 |
| 7 | `apps/desktop/src/renderer/pages/teams/index.tsx` | 1 | 卡片增加 Chat 入口 |
| 8 | `apps/desktop/src/renderer/pages/teams/chat.tsx` | 2 | 支持多 Agent 模式切换 |
| 9 | `apps/desktop/src/renderer/lib/team-chat-api.ts` | 2 | 新增 `useTeamMultiChatStream` |

---

## 八、协作模式与 Chat 方案适配

| 协作模式 | Phase 1（Supervisor 代理） | Phase 2（多 Agent 流式） | 推荐策略 |
|---------|---------------------------|------------------------|---------|
| **Council** | ✅ Supervisor 委派各 Agent | ✅ 并行流式，各 Agent 独立可见 | Phase 2 并行流式最佳 |
| **Pipeline** | ✅ Supervisor 按序委派 | ✅ 串行流式，按 order 依次 | Phase 2 串行流式最佳 |
| **Debate** | ✅ Supervisor 组织辩论 | ✅ 并行流式，多空分阵营 | Phase 2 并行流式最佳 |
| **Hierarchical** | ✅ 天然适配（Supervisor 委派） | ✅ 并行流式 | Phase 1 Supervisor 代理最佳 |
| **Parallel-scan** | ⚠️ 降级为单标的分析 | ⚠️ 降级为 Council | 建议用 Batch 模式 |

---

## 九、风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| Supervisor Agent 未配置 `agents` 属性，无法委派子 Agent | Phase 1 无法委派 | 在 `streamTeamChat()` 中检查 Supervisor 是否有子 agent；如无，通过 `instructions` 注入成员信息，让 Supervisor 在回复中模拟多角色 |
| 多 Agent 并行流式合并 SSE 时消息交错混乱 | Phase 2 用户体验差 | 前端按 agentId 分组渲染，不依赖消息到达顺序；SSE 事件携带 agentId 标识 |
| 流式过程中 Agent 报错 | 消息不完整 | 单个 Agent 报错不影响其他 Agent；错误信息以 SSE error 事件返回，前端显示错误提示 |
| Token 消耗大（多 Agent 各自生成完整回复） | 成本上升 | 在 Team 配置中增加 `chatMaxTokens` 限制；Phase 1 用 Supervisor 代理模式降低消耗 |
| 报告追问的上下文超长 | API 超时或截断 | 报告上下文只注入摘要（opinions 的 summary），details 按需展开 |
| Mastra `agent.stream()` API 在不同版本行为不一致 | 流式输出异常 | 先验证 Mastra `stream()` 的具体行为，参考现有 `useChat` 的调用方式 |

---

## 十、执行顺序总结

```
Phase 0 (1-2天)
  ├── Step 0.1: 创建 team-chat-engine.ts (streamReportFollowUp)
  ├── Step 0.2: 创建 team-chat-routes.ts (reportFollowUpStreamRoute)
  ├── Step 0.3: 注册路由到 research-routes.ts
  ├── Step 0.4: 创建 ReportFollowUpChat.tsx
  ├── Step 0.5: 嵌入报告详情页
  └── Step 0.6: 编译验证

Phase 1 (3-5天)
  ├── Step 1.1: 扩展 team-chat-engine.ts (streamTeamChat)
  ├── Step 1.2: 扩展 team-chat-routes.ts (teamChatStreamRoute)
  ├── Step 1.3: 创建 team-chat-api.ts (useTeamChatStream)
  ├── Step 1.4: 创建 pages/teams/chat.tsx
  ├── Step 1.5: 添加路由和导航入口
  └── Step 1.6: 编译验证

Phase 2 (5-8天)
  ├── Step 2.1: 创建 team-multi-stream.ts
  ├── Step 2.2: 添加 teamMultiChatStreamRoute
  ├── Step 2.3: 扩展 team-chat-api.ts (useTeamMultiChatStream)
  ├── Step 2.4: 创建 AgentMessageBubble.tsx
  ├── Step 2.5: 升级 chat.tsx 支持模式切换
  └── Step 2.6: 编译验证
```

---

## 十一、后续演进方向

1. **人机协作**：在 Chat 过程中支持人工审批 Agent 的工具调用（复用 Mastra 的 `requireToolApproval`）
2. **Chat 中触发执行**：用户在 Chat 中发送特定指令（如 `/execute AAPL`），自动触发 Batch 执行并返回报告
3. **Chat 历史持久化**：将 Team Chat 对话持久化到 DB，支持查看历史对话
4. **Agent 自主协作**：Agent 之间能互相看到对方的回复并自主回应（类似 AutoGen 的群聊模式）
5. **可视化协作图**：在 Chat 侧边栏展示 Agent 协作关系图，实时高亮正在发言的 Agent
