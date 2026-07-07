# Agent Team 配置功能 — 实施计划

> **日期**: 2026-07-07
> **状态**: ✅ 已完成实施
> **目标**: 实现 Agent Team 配置功能，将多个 Agent 按不同协作模式组织为可复用的团队，支持通用任务执行和可选的团队级共享 Memory，替代现有的 `ResearchWorkflowConfig`。

---

## 一、设计决策

| 决策点 | 结论 | 理由 |
|--------|------|------|
| 协作模式 | 保持现有 5 种（council / pipeline / debate / hierarchical / parallel-scan） | 已覆盖主流多 agent 协作场景 |
| 任务泛化 | 支持任意通用任务（非仅股票标的） | Team 不应与投研领域硬绑定 |
| 团队级共享 Memory | 可选开启，使用独立 LibSQL memory thread | 跨执行累积团队上下文，增强协作连贯性 |
| 替代策略 | `AgentTeamConfig` 完全替代 `ResearchWorkflowConfig` | 旧概念几乎未使用，统一概念降低心智负担 |
| 实施范围 | 三个 Phase 完整实现 | 一次性交付完整功能 |

---

## 二、架构概览

```
┌──────────────────────────────────────────────────────────────────┐
│                     桌面端 (Electron)                              │
│                                                                   │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────────┐ │
│  │ Agent    │  │ Agent    │  │ 投研报告  │  │ Agent Team       │ │
│  │ 管理     │  │ Playgrnd │  │ 中心     │  │ 管理台 (NEW)     │ │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────────┬─────────┘ │
│       │             │             │                  │           │
└───────┼─────────────┼─────────────┼──────────────────┼───────────┘
        │             │             │                  │
        ▼             ▼             ▼                  ▼
┌──────────────────────────────────────────────────────────────────┐
│                   Agent Server (Mastra)                            │
│                                                                   │
│  ┌─────────────┐  ┌──────────────────┐  ┌──────────────────────┐ │
│  │ Agent       │  │ Team             │  │ Team Execution       │ │
│  │ Registry    │  │ Config Store     │  │ Engine (NEW)         │ │
│  │ (existing)  │  │ (NEW)            │  │                      │ │
│  └──────┬──────┘  └──────┬───────────┘  └──────────┬───────────┘ │
│         │                │                         │             │
│         ▼                ▼                         ▼             │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │              Collaboration Engine (existing)              │    │
│  │  council | pipeline | debate | hierarchical | parallel   │    │
│  └──────────────────────────────────────────────────────────┘    │
│                                                                   │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────────────────┐  │
│  │ Report Store │  │ Tool Registry│  │ Team Shared Memory     │  │
│  │ (existing)   │  │ (existing)   │  │ (NEW, optional)        │  │
│  └──────────────┘  └──────────────┘  └────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
```

**核心变更**:
- 新增 `teams/` 模块：`team-config-store.ts`（CRUD）、`team-templates.ts`（预置模板）、`team-execution-engine.ts`（泛化执行引擎）
- 重构 `collaboration-engine.ts`：解耦投研特定逻辑，接受通用任务输入
- 新增 `TeamSharedMemory`：基于 Mastra Memory + LibSQLStore，按 team ID 隔离
- 前端新增 `pages/teams/` 页面和 `lib/team-api.ts` hooks

---

## 三、数据模型设计

### 3.1 新增 Schema（`packages/shared/src/index.ts`）

```typescript
// ─── Agent Team Schemas ─────────────────────────────────────────────

/** 团队成员角色 */
export const TeamMemberRoleSchema = z.enum([
  'leader',     // 领导者：负责拆解任务、汇总产出（通常等同 supervisor）
  'analyst',    // 分析者：提供专业分析
  'reviewer',   // 审查者：复核其他成员产出
  'executor',   // 执行者：执行具体操作
  'observer',   // 观察者：被动接收信息，不主动产出
]);

/** 团队成员定义 */
export const TeamMemberSchema = z.object({
  agentId: z.string().describe('引用的 Agent ID'),
  role: TeamMemberRoleSchema.default('analyst'),
  alias: z.string().optional().describe('团队内显示别名'),
  weight: z.number().min(0).max(1).default(1).describe('观点权重 (council/debate 模式加权汇总)'),
  side: z.enum(['bull', 'bear', 'neutral']).optional().describe('辩论模式中的阵营'),
  order: z.number().int().min(0).default(0).describe('pipeline 模式中的执行顺序'),
});

/** 协作模式配置 */
export const TeamCollaborationConfigSchema = z.object({
  pattern: CollaborationPatternSchema,
  rounds: z.number().int().min(1).default(1).describe('辩论/迭代轮数'),
  passThroughContext: z.boolean().default(true).describe('pipeline 模式：上游结果是否传递给下游'),
  targets: z.array(z.string()).optional().describe('parallel-scan 模式的多目标列表'),
  supervisorInstructions: z.string().optional().describe('覆盖默认 Supervisor 指令'),
});

/** Agent Team 配置 */
export const AgentTeamConfigSchema = z.object({
  id: z.string(),
  name: z.string().describe('团队名称'),
  description: z.string().describe('团队用途描述'),

  // 团队成员
  members: z.array(TeamMemberSchema).min(1),
  supervisorAgentId: z.string().optional().describe('汇总/裁决 Agent ID（如未指定则用 leader 角色成员）'),

  // 协作配置
  collaboration: TeamCollaborationConfigSchema,

  // 团队级配置
  teamInstructions: z.string().optional().describe('团队级共享指令，注入所有成员 prompt'),
  sharedContext: z.string().optional().describe('每次执行时注入的静态共享上下文'),
  outputFormat: z.enum(['research-report', 'summary', 'custom']).default('research-report'),
  customOutputSchema: z.string().optional().describe('自定义输出 JSON Schema 字符串（outputFormat=custom 时使用）'),

  // 共享 Memory
  sharedMemoryEnabled: z.boolean().default(false).describe('是否启用团队级共享 Memory'),

  // 默认参数
  defaultTarget: z.string().optional().describe('默认分析目标（如股票代码、主题等）'),

  // 元数据
  isTemplate: z.boolean().default(false),
  tags: z.array(z.string()).default([]),
  createdAt: z.string(),
  updatedAt: z.string(),
});

// ─── 通用任务执行结果 ────────────────────────────────────────────────

/** 团队执行输入 */
export const TeamExecutionInputSchema = z.object({
  teamId: z.string(),
  task: z.string().describe('任务描述（任意自然语言）'),
  target: z.string().optional().describe('分析目标（如股票代码、产品名等，可选）'),
  targets: z.array(z.string()).optional().describe('多目标列表（parallel-scan 模式）'),
  extraContext: z.string().optional().describe('额外上下文'),
});

/** 团队执行结果（通用） */
export const TeamExecutionResultSchema = z.object({
  id: z.string().optional(),
  teamId: z.string(),
  teamName: z.string(),
  task: z.string(),
  target: z.string().optional(),
  pattern: CollaborationPatternSchema,
  opinions: z.array(AgentOpinionSchema),
  conclusion: z.string().describe('综合结论'),
  confidence: z.number().min(0).max(1).optional(),
  risks: z.array(RiskItemSchema).optional(),
  trackingConditions: z.array(TrackingConditionSchema).optional(),
  rawOutput: z.string().optional().describe('Supervisor 原始输出（非结构化模式）'),
  metadata: z.record(z.any()).optional(),
  createdAt: z.string(),
});

// TypeScript Types
export type TeamMemberRole = z.infer<typeof TeamMemberRoleSchema>;
export type TeamMember = z.infer<typeof TeamMemberSchema>;
export type TeamCollaborationConfig = z.infer<typeof TeamCollaborationConfigSchema>;
export type AgentTeamConfig = z.infer<typeof AgentTeamConfigSchema>;
export type TeamExecutionInput = z.infer<typeof TeamExecutionInputSchema>;
export type TeamExecutionResult = z.infer<typeof TeamExecutionResultSchema>;
```

### 3.2 废弃的 Schema

`ResearchWorkflowConfigSchema` 将被标记为 `@deprecated`，保留类型导出以便编译兼容，但不再在业务代码中使用。存储表 `workflow_configs` 中的旧数据将在初始化时迁移到 `agent_teams` 表（如果存在）。

### 3.3 ResearchReport 向后兼容

`ResearchReportSchema` 保持不变，新增可选字段：
```typescript
teamId: z.string().optional().describe('产出此报告的 Team ID'),
```

投研场景仍使用 `ResearchReport` 作为输出格式（当 `outputFormat: 'research-report'` 时），其他场景使用 `TeamExecutionResult`。

---

## 四、分阶段实施

### Phase 1: 核心数据层 + API（后端）

**目标**: 建立 Team 配置的完整 CRUD 存储、预置模板和 REST API 端点。

#### 新增文件

| 文件 | 职责 |
|------|------|
| `apps/agent-server/src/mastra/teams/team-config-store.ts` | Team 配置 CRUD（LibSQL） |
| `apps/agent-server/src/mastra/teams/team-templates.ts` | 预置团队模板 |
| `apps/agent-server/src/mastra/teams/team-shared-memory.ts` | 团队级共享 Memory 管理 |

#### 修改文件

| 文件 | 变更 |
|------|------|
| `packages/shared/src/index.ts` | 新增 Team 相关 Schema 和 Types；标记 `ResearchWorkflowConfigSchema` 废弃 |
| `apps/agent-server/src/mastra/api/research-routes.ts` | 新增 Team CRUD + 执行路由；移除旧 workflow-config 路由 |
| `apps/agent-server/src/mastra/api/team-routes.ts`（新建） | Team 专用路由模块，导出到 `research-routes` |
| `apps/agent-server/src/mastra/index.ts` | 初始化 Team store；移除 workflow-config 初始化 |

#### 具体任务

- [ ] **Step 1.1: 在 `packages/shared/src/index.ts` 中新增所有 Team Schema**

  添加 `TeamMemberRoleSchema`、`TeamMemberSchema`、`TeamCollaborationConfigSchema`、`AgentTeamConfigSchema`、`TeamExecutionInputSchema`、`TeamExecutionResultSchema` 及对应 TypeScript 类型。给 `ResearchReportSchema` 添加可选 `teamId` 字段。

- [ ] **Step 1.2: 编译 shared 包**

  ```bash
  npm run build -w @trading-agent/shared
  ```

- [ ] **Step 1.3: 创建 `team-config-store.ts`**

  参照 `agent-registry.ts` 模式，使用 LibSQL + `agent_teams` 表：
  - `initTeamConfigStore()` — 建表 + 迁移旧 `workflow_configs` 数据
  - `listTeamConfigs()` — 列出所有团队
  - `getTeamConfig(id)` — 获取单个团队
  - `createTeamConfig(config)` — 创建团队
  - `updateTeamConfig(id, updates)` — 更新团队
  - `deleteTeamConfig(id)` — 删除团队
  - `seedDefaultTeams()` — 首次启动时从模板种子化默认团队

  迁移逻辑：读取 `workflow_configs` 表，将每条 `ResearchWorkflowConfig` 转换为 `AgentTeamConfig`（`participantAgentIds` → `members`，`pattern` → `collaboration.pattern`），插入 `agent_teams` 表后清空旧表。

- [ ] **Step 1.4: 创建 `team-templates.ts`**

  预置 3 个团队模板：
  1. **深度投研组**（`tpl-team-deep-research`）：4 个投研 agent + 投研总监 supervisor，Council 模式，投研报告输出
  2. **快速技术扫描小队**（`tpl-team-quick-scan`）：技术信号 + 风险检查 agent，Pipeline 模式，摘要输出
  3. **多空辩论团**（`tpl-team-debate`）：4 个投研 agent（2 bull / 2 bear），Debate 模式，投研报告输出

- [ ] **Step 1.5: 创建 `team-shared-memory.ts`**

  ```typescript
  import { Memory } from '@mastra/memory';
  import { LibSQLStore } from '@mastra/libsql';

  const DB_URL = 'file:./mastra.db';
  const memoryCache = new Map<string, Memory>();

  /** 为团队创建/获取共享 Memory 实例 */
  export function getTeamSharedMemory(teamId: string): Memory {
    if (!memoryCache.has(teamId)) {
      memoryCache.set(teamId, new Memory({
        storage: new LibSQLStore({
          id: `team-memory-${teamId}`,
          url: DB_URL,
        }),
        options: {
          lastMessages: 20,
          semanticRecall: false,
        },
      }));
    }
    return memoryCache.get(teamId)!;
  }

  /** 清除团队共享 Memory */
  export async function clearTeamSharedMemory(teamId: string): Promise<void> { ... }
  ```

- [ ] **Step 1.6: 创建 `team-routes.ts` 并注册到 `research-routes.ts`**

  API 端点：

  | 方法 | 路径 | 说明 |
  |------|------|------|
  | `GET` | `/research/teams` | 列出所有团队 |
  | `GET` | `/research/teams/:id` | 获取单个团队 |
  | `POST` | `/research/teams` | 创建团队 |
  | `PUT` | `/research/teams/:id` | 更新团队 |
  | `DELETE` | `/research/teams/:id` | 删除团队 |
  | `GET` | `/research/team-templates` | 列出预置模板 |
  | `POST` | `/research/teams/from-template` | 从模板创建 |
  | `POST` | `/research/teams/:id/execute` | 执行团队任务 |
  | `DELETE` | `/research/teams/:id/memory` | 清除团队共享 Memory |

  同时移除旧的 `workflow-configs` 相关路由。

- [ ] **Step 1.7: 修改 `index.ts`**

  - 导入并调用 `initTeamConfigStore()`
  - 移除 `initWorkflowConfigStore()` 调用
  - 保留旧 `workflow-config-store.ts` 文件但不再导入

- [ ] **Step 1.8: 编译验证**

  ```bash
  npm run build -w @trading-agent/shared
  npm run build -w agent-server
  ```

---

### Phase 2: 团队执行引擎（后端）

**目标**: 泛化 `collaboration-engine.ts`，支持通用任务输入，注入团队级配置（teamInstructions、sharedContext、weight、sharedMemory）。

#### 新增文件

| 文件 | 职责 |
|------|------|
| `apps/agent-server/src/mastra/teams/team-execution-engine.ts` | 通用团队执行引擎 |

#### 修改文件

| 文件 | 变更 |
|------|------|
| `apps/agent-server/src/mastra/workflows/collaboration-engine.ts` | 保留核心模式逻辑，但重构为接受通用参数 |
| `apps/agent-server/src/mastra/workflows/trading-workflow.ts` | 适配新引擎接口 |
| `apps/agent-server/src/mastra/api/research-routes.ts` | 协作启动路由适配新引擎 |

#### 架构设计

**`team-execution-engine.ts`** 是 `collaboration-engine.ts` 的上层封装：

```
TeamExecutionInput
      │
      ▼
┌─────────────────────────┐
│  team-execution-engine   │
│  ┌─────────────────────┐ │
│  │ 1. 加载 TeamConfig  │ │
│  │ 2. 解析成员→agents  │ │
│  │ 3. 注入 teamInstr.  │ │
│  │ 4. 注入 sharedCtx   │ │
│  │ 5. 绑定 sharedMem   │ │
│  │ 6. 构建 TaskContext  │ │
│  └─────────┬───────────┘ │
│            ▼             │
│  ┌─────────────────────┐ │
│  │ collaboration-engine │ │  ← 核心 5 种模式（重构为通用）
│  │  (delegate)          │ │
│  └─────────┬───────────┘ │
│            ▼             │
│  ┌─────────────────────┐ │
│  │ 7. 格式化输出       │ │
│  │    research-report  │ │
│  │    summary          │ │
│  │    custom           │ │
│  └─────────┬───────────┘ │
│            ▼             │
│  TeamExecutionResult     │
└─────────────────────────┘
```

#### 具体任务

- [ ] **Step 2.1: 重构 `collaboration-engine.ts` 的输入接口**

  将 `CollaborationInput` 从投研特定改为通用：

  ```typescript
  // 新的通用输入
  interface CollaborationExecutionInput {
    task: string;                    // 通用任务描述
    target?: string;                 // 可选目标（股票代码、产品名等）
    targets?: string[];              // parallel-scan 多目标
    pattern: CollaborationPattern;
    members: TeamMember[];           // 替代 participantAgentIds，携带 weight/side/order
    supervisorAgentId?: string;
    teamInstructions?: string;       // 团队级共享指令
    sharedContext?: string;          // 静态共享上下文
    extraContext?: string;           // 本次执行的额外上下文
    rounds?: number;                 // 辩论/迭代轮数
    passThroughContext?: boolean;
    supervisorInstructions?: string;
    sharedMemory?: Memory;           // 团队共享 Memory 实例
    outputFormat: 'research-report' | 'summary' | 'custom';
    customOutputSchema?: string;
  }
  ```

  各模式的 `execute*` 函数签名从 `(mastra, input, marketData)` 改为 `(mastra, input, taskContext)`，其中 `taskContext` 是一个通用字符串（替代投研专属的 `dataCtx`）。

- [ ] **Step 2.2: 修改 agent 调用逻辑，注入团队配置**

  `callAgentForOpinion` 函数增强：
  - 在 prompt 前面拼接 `teamInstructions`（如有）
  - 在 prompt 前面拼接 `sharedContext`（如有）
  - 如果 `sharedMemory` 存在，在 `agent.generate()` 的 options 中传入该 memory 实例（通过创建临时 agent 实例或修改 generate 调用方式）
  - 支持 `weight` 参数：在 council 模式的 supervisor 汇总 prompt 中标注各成员权重

  ```typescript
  async function callAgentForOpinion(
    mastra: MastraLike,
    agentId: string,
    prompt: string,
    options?: {
      teamInstructions?: string;
      sharedMemory?: Memory;
      structuredOutputSchema?: z.ZodType;
    },
  ): Promise<AgentOpinion> {
    const agent = mastra.getAgent(agentId);
    const fullPrompt = [
      options?.teamInstructions && `## 团队指令\n${options.teamInstructions}`,
      prompt,
    ].filter(Boolean).join('\n\n');

    const generateOptions: any = { maxSteps: 5 };
    if (options?.structuredOutputSchema) {
      generateOptions.structuredOutput = { schema: options.structuredOutputSchema };
    }

    const result = await agent.generate(fullPrompt, generateOptions);
    // ... 解析逻辑不变
  }
  ```

- [ ] **Step 2.3: 创建 `team-execution-engine.ts`**

  ```typescript
  export async function executeTeamTask(
    mastra: MastraLike,
    input: TeamExecutionInput,
  ): Promise<TeamExecutionResult> {
    // 1. 加载 TeamConfig
    const teamConfig = await getTeamConfig(input.teamId);
    if (!teamConfig) throw new Error(`Team "${input.teamId}" not found`);

    // 2. 构建通用协作输入
    const collabInput: CollaborationExecutionInput = {
      task: input.task,
      target: input.target ?? teamConfig.defaultTarget,
      targets: input.targets,
      pattern: teamConfig.collaboration.pattern,
      members: teamConfig.members,
      supervisorAgentId: teamConfig.supervisorAgentId,
      teamInstructions: teamConfig.teamInstructions,
      sharedContext: teamConfig.sharedContext,
      extraContext: input.extraContext,
      rounds: teamConfig.collaboration.rounds,
      passThroughContext: teamConfig.collaboration.passThroughContext,
      supervisorInstructions: teamConfig.collaboration.supervisorInstructions,
      sharedMemory: teamConfig.sharedMemoryEnabled
        ? getTeamSharedMemory(teamConfig.id)
        : undefined,
      outputFormat: teamConfig.outputFormat,
      customOutputSchema: teamConfig.customOutputSchema,
    };

    // 3. 委托给 collaboration-engine 执行
    const rawResult = await executeCollaboration(mastra, collabInput);

    // 4. 格式化输出
    const result = formatTeamResult(teamConfig, input, rawResult);

    // 5. 持久化（投研报告存入 report-store，其他存入 team-execution-results）
    await persistResult(result);

    return result;
  }
  ```

- [ ] **Step 2.4: 适配投研场景的向后兼容**

  保留现有的 `/research/collaboration/start` 端点，但内部改为创建临时 team config 并调用 `executeTeamTask`。确保现有前端 `CollaborationPage` 不受影响。

  ```typescript
  // research-routes.ts 中的 startCollaborationRoute handler
  const result = await executeTeamTask(c.get('mastra'), {
    teamId: '__adhoc__',  // 临时团队
    task: `分析 ${symbol} 的投资价值`,
    target: symbol,
    // ... 其余参数从 body 构建
  });
  ```

  或更优雅的方案：`executeCollaboration` 保持直接调用，`executeTeamTask` 是上层封装。两条路径并行，不互相依赖。

- [ ] **Step 2.5: 修改 `trading-workflow.ts`**

  `tradingWorkflow` 的 `collaborationAnalysis` step 适配新的 `CollaborationExecutionInput` 接口，传递通用参数而非投研专属的 `symbol` + `marketData`。投研特定的市场数据获取逻辑移到 step 外部或由调用方注入。

- [ ] **Step 2.6: 编译验证**

  ```bash
  npm run build -w agent-server
  ```

---

### Phase 3: 前端 UI

**目标**: 实现 Agent Team 管理台 UI（列表、编辑、执行），替换现有 Collaboration 页面中的临时 agent 选择逻辑。

#### 新增文件

| 文件 | 职责 |
|------|------|
| `apps/desktop/src/renderer/pages/teams/index.tsx` | 团队列表页 |
| `apps/desktop/src/renderer/pages/teams/edit.tsx` | 团队编辑/创建页 |
| `apps/desktop/src/renderer/pages/teams/execute.tsx` | 团队执行页 |
| `apps/desktop/src/renderer/lib/team-api.ts` | Team API hooks（TanStack Query） |
| `apps/desktop/src/renderer/pages/teams/components/TeamMemberPicker.tsx` | 成员选择器组件 |
| `apps/desktop/src/renderer/pages/teams/components/CollaborationConfigEditor.tsx` | 协作模式配置编辑器 |
| `apps/desktop/src/renderer/pages/teams/components/TeamCard.tsx` | 团队卡片组件 |
| `apps/desktop/src/renderer/pages/teams/components/TeamExecutionProgress.tsx` | 执行进度组件 |

#### 修改文件

| 文件 | 变更 |
|------|------|
| `apps/desktop/src/renderer/App.tsx` | 新增 `/teams`、`/teams/create`、`/teams/:id/edit`、`/teams/:id/execute` 路由 |
| `apps/desktop/src/renderer/lib/nav/nav-items.tsx` | 新增「Agent Team」导航项 |
| `apps/desktop/src/renderer/pages/collaboration/index.tsx` | 改造为 Team 选择入口（选择已有 Team 或快速配置） |
| `apps/desktop/src/renderer/pages/dashboard/index.tsx` | Dashboard 快捷操作增加「管理团队」入口 |
| `apps/desktop/src/renderer/lib/research-api.ts` | 新增 Team 相关 hooks；保留旧 hooks 向后兼容 |

#### 具体任务

- [ ] **Step 3.1: 创建 `team-api.ts` — 前端 API Hooks**

  ```typescript
  // team-api.ts

  export function useTeamConfigs() {
    return useQuery({
      queryKey: ['team-configs'],
      queryFn: () => apiFetch<{ teams: AgentTeamConfig[] }>('/teams'),
    });
  }

  export function useTeamConfig(id: string | null) {
    return useQuery({
      queryKey: ['team-config', id],
      queryFn: () => apiFetch<{ team: AgentTeamConfig }>(`/teams/${id}`),
      enabled: !!id,
    });
  }

  export function useCreateTeam() { ... }
  export function useUpdateTeam() { ... }
  export function useDeleteTeam() { ... }
  export function useTeamTemplates() { ... }
  export function useCreateTeamFromTemplate() { ... }
  export function useExecuteTeam() { ... }
  export function useClearTeamMemory() { ... }
  ```

- [ ] **Step 3.2: 新增导航项**

  在 `nav-items.tsx` 的「投研」section 中新增：

  ```typescript
  {
    name: 'Agent Team',
    url: '/teams',
    Icon: Users,  // 或 TeamIcon
    isOnMastraPlatform: false,
    activePaths: ['/teams'],
  },
  ```

- [ ] **Step 3.3: 新增路由**

  在 `App.tsx` 的投研核心路由区域新增：

  ```typescript
  { path: '/teams', element: <TeamsListPage />, handle: navHandle('/teams') },
  { path: '/teams/create', element: <TeamEditPage />, handle: navHandleWithChildren('/teams', [{ id: 'create-team', label: '创建团队' }]) },
  { path: '/teams/:teamId/edit', element: <TeamEditPage />, handle: navHandleWithChildren('/teams', [{ id: 'edit-team', label: '编辑团队' }]) },
  { path: '/teams/:teamId/execute', element: <TeamExecutePage />, handle: navHandleWithChildren('/teams', [{ id: 'execute-team', label: '执行任务' }]) },
  ```

- [ ] **Step 3.4: 实现团队列表页 `pages/teams/index.tsx`**

  - 顶部操作栏：「创建团队」按钮 + 「从模板创建」按钮
  - 主体：团队卡片网格，每张卡片展示：
    - 团队名称 + 描述
    - 成员头像组（前 5 个 agent 的 icon + "+N"）
    - 协作模式图标 + 标签
    - 标签 chips
    - 操作按钮：执行、编辑、删除
  - 空状态：引导从模板创建

- [ ] **Step 3.5: 实现 `TeamMemberPicker.tsx` 成员选择器**

  - 左侧：所有可用 Agent 列表（可搜索/筛选）
  - 右侧：已选成员列表，每行可配置：
    - 角色（leader / analyst / reviewer / executor / observer）
    - 别名（可选）
    - 权重滑块（0-1）
    - 阵营选择（bull / bear / neutral，仅 debate 模式显示）
    - 顺序拖拽（pipeline 模式显示）
  - 底部：Supervisor 选择器（可选，默认使用 leader 角色）

- [ ] **Step 3.6: 实现 `CollaborationConfigEditor.tsx` 协作配置编辑器**

  - 协作模式选择（5 种模式的图标卡片，类似现有 CollaborationPage 的模式选择）
  - 模式特定参数：
    - council: 无额外参数
    - pipeline: passThroughContext 开关
    - debate: rounds 输入框
    - hierarchical: supervisorInstructions 文本框
    - parallel-scan: targets 输入框
  - 团队级配置：
    - teamInstructions 文本框（多行）
    - sharedContext 文本框（多行）
    - outputFormat 选择器（research-report / summary / custom）
    - customOutputSchema 编辑器（outputFormat=custom 时显示）
    - sharedMemoryEnabled 开关
    - defaultTarget 输入框

- [ ] **Step 3.7: 实现团队编辑页 `pages/teams/edit.tsx`**

  - 页面顶部：团队名称 + 描述编辑
  - 左侧：`TeamMemberPicker`
  - 右侧：`CollaborationConfigEditor`
  - 底部：保存 / 取消按钮
  - 创建模式：从空白开始或从模板加载

- [ ] **Step 3.8: 实现团队执行页 `pages/teams/execute.tsx`**

  - 顶部：团队信息卡片（名称、成员数、模式）
  - 输入区：
    - 任务描述文本框（必填，多行）
    - 目标输入框（可选，如股票代码）
    - 额外上下文文本框（可选）
    - parallel-scan 模式：多目标输入
  - 启动按钮
  - `TeamExecutionProgress` 组件：
    - 状态：idle / running / success / error
    - running 时显示 spinner
    - success 时显示结果摘要 + 跳转报告链接
    - error 时显示错误信息
  - 如果团队启用了 sharedMemory，显示「清除团队记忆」按钮

- [ ] **Step 3.9: 改造 `CollaborationPage`**

  将现有 `/collaboration` 页面改造为：
  - 顶部：快速选择已有 Team（下拉选择器），选中后填充默认参数
  - 底部：保留手动选择 agent + 模式的快速配置区域（创建临时团队）
  - 「保存为 Team」按钮：将当前配置保存为新 Team

- [ ] **Step 3.10: Dashboard 增加 Team 入口**

  `QuickActionsPanel` 新增：
  ```typescript
  {
    label: '管理 Agent Team',
    description: '创建和管理多 Agent 协作团队',
    icon: Users,
    color: 'text-amber-400',
    onClick: () => navigate('/teams'),
  },
  ```

- [ ] **Step 3.11: 编译验证**

  ```bash
  npm run build -w trading-agent
  ```

---

## 五、文件变更清单

### 新增文件（11 个）

| # | 文件路径 | Phase |
|---|---------|-------|
| 1 | `apps/agent-server/src/mastra/teams/team-config-store.ts` | 1 |
| 2 | `apps/agent-server/src/mastra/teams/team-templates.ts` | 1 |
| 3 | `apps/agent-server/src/mastra/teams/team-shared-memory.ts` | 1 |
| 4 | `apps/agent-server/src/mastra/api/team-routes.ts` | 1 |
| 5 | `apps/agent-server/src/mastra/teams/team-execution-engine.ts` | 2 |
| 6 | `apps/desktop/src/renderer/lib/team-api.ts` | 3 |
| 7 | `apps/desktop/src/renderer/pages/teams/index.tsx` | 3 |
| 8 | `apps/desktop/src/renderer/pages/teams/edit.tsx` | 3 |
| 9 | `apps/desktop/src/renderer/pages/teams/execute.tsx` | 3 |
| 10 | `apps/desktop/src/renderer/pages/teams/components/TeamMemberPicker.tsx` | 3 |
| 11 | `apps/desktop/src/renderer/pages/teams/components/CollaborationConfigEditor.tsx` | 3 |

### 修改文件（8 个）

| # | 文件路径 | Phase | 变更摘要 |
|---|---------|-------|---------|
| 1 | `packages/shared/src/index.ts` | 1 | 新增 Team Schema + Types；标记旧 Schema 废弃 |
| 2 | `apps/agent-server/src/mastra/api/research-routes.ts` | 1+2 | 新增 Team 路由；适配协作路由 |
| 3 | `apps/agent-server/src/mastra/index.ts` | 1 | 初始化 Team store |
| 4 | `apps/agent-server/src/mastra/workflows/collaboration-engine.ts` | 2 | 通用化输入接口；注入团队配置 |
| 5 | `apps/agent-server/src/mastra/workflows/trading-workflow.ts` | 2 | 适配新接口 |
| 6 | `apps/desktop/src/renderer/App.tsx` | 3 | 新增 Team 路由 |
| 7 | `apps/desktop/src/renderer/lib/nav/nav-items.tsx` | 3 | 新增导航项 |
| 8 | `apps/desktop/src/renderer/pages/collaboration/index.tsx` | 3 | 改造为 Team 选择入口 |
| 9 | `apps/desktop/src/renderer/pages/dashboard/index.tsx` | 3 | 增加 Team 快捷入口 |

### 废弃文件（2 个，保留但不导入）

| # | 文件路径 | 说明 |
|---|---------|------|
| 1 | `apps/agent-server/src/mastra/workflows/workflow-config-store.ts` | 被 `team-config-store.ts` 替代 |
| 2 | `packages/shared/src/index.ts` 中的 `ResearchWorkflowConfigSchema` | 被 `AgentTeamConfigSchema` 替代 |

---

## 六、数据迁移方案

### 迁移流程（`initTeamConfigStore()` 内部执行）

```
启动 → 检查 agent_teams 表是否存在
  ├─ 存在 → 跳过迁移
  └─ 不存在 → 建表
        → 检查 workflow_configs 表是否有数据
          ├─ 有数据 → 逐条转换为 AgentTeamConfig 并插入 agent_teams
          │          → 删除 workflow_configs 表中的旧数据
          │          → 日志记录迁移数量
          └─ 无数据 → 直接种子化默认团队模板
```

### 转换规则

```
ResearchWorkflowConfig → AgentTeamConfig

{
  id: wf.id,
  name: wf.name,
  description: '迁移自旧工作流配置',
  members: wf.participantAgentIds.map((agentId, i) => ({
    agentId,
    role: 'analyst',
    weight: 1,
    order: i,
  })),
  supervisorAgentId: wf.supervisorAgentId,
  collaboration: {
    pattern: wf.pattern,
    rounds: 1,
    passThroughContext: true,
    targets: wf.symbols,
  },
  outputFormat: 'research-report',
  sharedMemoryEnabled: false,
  tags: ['migrated'],
  ...
}
```

---

## 七、验收标准

### Phase 1 验收
- [ ] `packages/shared` 编译通过，新增 Team Schema 可被 agent-server 导入
- [ ] `GET /api/research/teams` 返回种子化的默认团队列表
- [ ] `POST /api/research/teams` 可创建新团队并持久化
- [ ] `PUT /api/research/teams/:id` 可更新团队配置
- [ ] `DELETE /api/research/teams/:id` 可删除团队
- [ ] `GET /api/research/team-templates` 返回 3 个预置模板
- [ ] `POST /api/research/teams/from-template` 可从模板创建团队
- [ ] 旧 `workflow_configs` 数据（如有）已迁移到 `agent_teams`
- [ ] 团队级共享 Memory 可按 teamId 创建和清除

### Phase 2 验收
- [ ] `POST /api/research/teams/:id/execute` 可执行通用任务（非仅股票分析）
- [ ] Council 模式：N 个 agent 并行分析，Supervisor 汇总，teamInstructions 注入到 prompt
- [ ] Pipeline 模式：串行执行，上游结果传递给下游
- [ ] Debate 模式：成员按 side 分为多空阵营，rounds 控制辩论轮数
- [ ] Hierarchical 模式：Supervisor 动态委派
- [ ] Parallel-scan 模式：多目标并行扫描
- [ ] sharedMemoryEnabled=true 时，团队 Memory 跨执行保留上下文
- [ ] outputFormat=summary 时输出简短摘要；outputFormat=custom 时按自定义 schema 输出
- [ ] 现有 `/research/collaboration/start` 端点仍正常工作（向后兼容）
- [ ] `tradingWorkflow` 编译通过且执行正常

### Phase 3 验收
- [ ] 导航栏出现「Agent Team」入口
- [ ] 团队列表页展示所有团队卡片，可执行/编辑/删除
- [ ] 团队编辑页可选择成员、配置角色/权重/阵营、选择协作模式、配置团队指令
- [ ] 从模板创建团队功能正常
- [ ] 团队执行页可输入通用任务、启动执行、查看进度和结果
- [ ] 共享 Memory 开关在 UI 中可配置
- [ ] CollaborationPage 改造后可选择已有 Team 快速启动
- [ ] Dashboard 快捷操作包含 Team 管理入口
- [ ] `npm run build -w trading-agent` 编译通过

---

## 八、风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| `collaboration-engine` 重构导致现有投研链路中断 | 投研功能不可用 | 保留 `executeCollaboration` 原始接口签名，通过适配层转换；新旧接口并行 |
| 共享 Memory 实例与 Mastra Agent 的绑定方式不确定 | Memory 功能不可用 | 先通过在 prompt 中注入历史上下文实现（text-based memory），后续探索 Mastra Memory API |
| 迁移脚本执行失败 | 旧数据丢失 | 迁移前不删除旧表，仅标记为已迁移；迁移失败时回退到种子化默认团队 |
| 前端 Team 编辑页交互复杂度高 | 开发周期延长 | 优先实现核心交互（成员选择 + 模式选择），高级配置（weight/side/custom schema）后续迭代 |
| `parallel-scan` 模式的通用化不直观 | 用户体验差 | 该模式保留 `targets` 概念，前端根据团队配置动态展示输入框 |

---

## 九、执行顺序总结

```
Phase 1 (后端数据层)
  Step 1.1 → 1.2 → 1.3 → 1.4 → 1.5 → 1.6 → 1.7 → 1.8
                                            ↓
Phase 2 (执行引擎)                         ↓
  Step 2.1 → 2.2 → 2.3 → 2.4 → 2.5 → 2.6
                    ↓
Phase 3 (前端 UI)
  Step 3.1 → 3.2 → 3.3 → 3.4 → 3.5 → 3.6 → 3.7 → 3.8 → 3.9 → 3.10 → 3.11
```

> **备注**: 本计划基于 2026-07-07 代码状态编写。Phase 1 和 Phase 2 可部分并行（Step 2.1-2.2 可与 Step 1.3-1.5 同时进行），Phase 3 依赖 Phase 1 的 API 端点可用。
