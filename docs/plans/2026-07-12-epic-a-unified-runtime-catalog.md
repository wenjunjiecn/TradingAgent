# Epic A：统一运行时目录 — 实施计划

> **创建日期**: 2026-07-12
> **状态**: 待评审
> **涉及范围**: `packages/shared`、`apps/agent-server`、`apps/desktop`
> **对应 PRD**: [Trading Agent 产品优化 PRD](../prd/2026-07-10-trading-agent-product-optimization-prd.md) §8.1 FR-CATALOG-001/002/003
> **对应 Stories**: US-CAT-001 ~ US-CAT-006

---

## 一、现状分析与核心问题

### 1.1 Agent — 两套配置源并存

```
┌──────────────────────────────────────────────────────────────────┐
│  Mastra Stored Agent API (editor: db)     agent_configs (自建表)  │
│  ┌────────────────────────────────┐    ┌────────────────────────┐│
│  │ Mastra Editor 管理的 Agent      │    │ id, config(JSON)       ││
│  │ - 通过 @mastra/client-js CRUD   │    │ - 模板种子化 8 个角色   ││
│  │ - 前端 Agent 编辑页使用此 API    │    │ - loadAllAgents() 读取  ││
│  │ - 支持 version/skill/browser    │    │ - instantiateAgent()   ││
│  └────────────┬───────────────────┘    └─────────┬──────────────┘│
│               │                                   │               │
│               │     ❌ 两套数据不互通              │               │
│               ▼                                   ▼               │
│          前端展示 / 编辑                    Mastra 运行时实例化     │
└──────────────────────────────────────────────────────────────────┘
```

**核心问题**：
- 用户在 Agent 编辑页（通过 Mastra Stored Agent API）创建/修改的 Agent，与运行时 `loadAllAgents()` 读取的 `agent_configs` 表是两套数据。
- `agent_configs` 在首次启动时从 `agent-templates.ts` 种子化，之后与前端编辑脱节。
- Team 的 `members[].agentId` 引用的是 `agent_configs` 中的 ID，但用户在 UI 中看到的 Agent 来自 Mastra Stored Agent API。

**关键代码位置**：
- `apps/agent-server/src/mastra/agents/agent-registry.ts` — 自建 Agent 目录
- `apps/agent-server/src/mastra/index.ts:57-60` — `loadAllAgents()` 在启动时一次性加载
- `apps/desktop/src/renderer/domains/agents/hooks/use-agent.ts` — 前端使用 Mastra client
- `apps/agent-server/src/mastra/index.ts:68-70` — `MastraEditor({ source: 'db' })` 已配置

### 1.2 Tool — 配置已入库但运行时未接入

```
┌──────────────────────────────────────────────────────────────────┐
│  tool_configs (DB)                         toolRegistry (代码)   │
│  ┌────────────────────────────────┐    ┌────────────────────────┐│
│  │ ✅ 支持 builtin/http/mcp/code  │    │ 4 个内置工具实例        ││
│  │ ✅ 支持 CRUD + Schema 校验     │    │ (marketDataTool 等)    ││
│  │ ✅ 支持 test 端点              │    │                        ││
│  │ ✅ 前端可管理                   │    │                        ││
│  └────────────┬───────────────────┘    └─────────┬──────────────┘│
│               │                                   │               │
│               │  ❌ Agent 实例化时只读 toolRegistry │               │
│               │     不读 tool_configs              │               │
│               ▼                                   ▼               │
│          前端管理 / 测试                    getToolsByIds()       │
└──────────────────────────────────────────────────────────────────┘
```

**核心问题**：
- `tool-registry.ts` 中的 `getToolsByIds()` 仍然是**同步函数**，只从代码 `toolRegistry` 取工具，不读 `tool_configs` DB 表。
- `agent-registry.ts` 的 `instantiateAgent()` 调用 `getToolsByIds(config.toolIds)`，因此 Agent 只能使用 4 个内置工具，UI 中创建的 HTTP/MCP/Code 工具在运行时不会被加载。
- Tool 配置变更（启用/停用/更新）不会反映到已实例化的 Agent 上——Agent 在启动时一次性实例化。

**关键代码位置**：
- `apps/agent-server/src/mastra/tools/tool-registry.ts:27-35` — `getToolsByIds` 同步，只读 `toolRegistry`
- `apps/agent-server/src/mastra/agents/agent-registry.ts:237-264` — `instantiateAgent` 同步调用 `getToolsByIds`
- `apps/agent-server/src/mastra/tools/tool-factory.ts` — 工具工厂已实现但未被 `getToolsByIds` 调用
- `apps/agent-server/src/mastra/tools/tool-config-store.ts` — DB 存储已完整

### 1.3 Skill — 完全脱离 Mastra Workspace

```
┌──────────────────────────────────────────────────────────────────┐
│  Mastra Workspace Skills                skill_configs (自建表)    │
│  ┌────────────────────────────────┐    ┌────────────────────────┐│
│  │ Workspace({ skills: ['skills']})│    │ id, config(JSON)       ││
│  │ LocalSkillSource 读取 SKILL.md   │    │ 3 个内置 Skill 种子     ││
│  │ 前端 useAgentSkills 使用此 API   │    │ ❌ 不接入运行时         ││
│  │ 支持 stored skill CRUD          │    │ ❌ 仅元数据展示         ││
│  └────────────────────────────────┘    └────────────────────────┘│
│               ✅ 真实运行                            ❌ 展示用     │
└──────────────────────────────────────────────────────────────────┘
```

**核心问题**：
- `skill_configs` 表中的 Skill 完全不接入 Agent 运行时——Agent 实例化时不读取任何 Skill 配置。
- Mastra Workspace 已在 `index.ts:32-40` 配置，但 `skill_configs` 与 Workspace 互不感知。
- 前端 `useAgentSkills` hook 使用 Mastra Stored Skill API，与 `skill_configs` 无关。
- `skill-routes.ts` 暴露的 CRUD API 操作的是 `skill_configs`，而前端 Agent 编辑页用的是 Mastra API——两套接口并存。

**关键代码位置**：
- `apps/agent-server/src/mastra/tools/skill-config-store.ts` — 自建 Skill 存储（仅元数据）
- `apps/agent-server/src/mastra/index.ts:32-40` — Workspace 配置（真实 Skill 运行）
- `apps/desktop/src/renderer/domains/agents/hooks/use-agent-skills.ts` — 前端使用 Mastra API
- `apps/agent-server/src/mastra/api/skill-routes.ts` — 操作 `skill_configs`（与运行时无关）

### 1.4 Team 引用关系 — 删除不检查

- `agent_teams` 表的 `members[].agentId` 和 `supervisorAgentId` 引用 Agent ID。
- `agent-registry.ts` 的 `deleteAgentConfig()` 直接删除，不检查 Team 引用。
- 没有引用检查 API，前端 `delete-agent-dialog.tsx` 不展示引用关系。

---

## 二、技术决策

基于 PRD §17 建议决策和代码库现状，本计划采用以下默认决策：

| 决策项 | 选择 | 理由 |
|--------|------|------|
| Agent 权威数据源 | **Mastra Stored Agent (Editor DB)** | `MastraEditor({ source: 'db' })` 已配置；前端已使用 `@mastra/client-js`；保留自建 `agent_configs` 作为只读兼容层 |
| Tool 权威数据源 | **`tool_configs` DB 表** | 已有完整的 CRUD + Factory + Schema 校验，只需接入运行时 |
| Skill 权威数据源 | **Mastra Workspace Skill** | Workspace 已配置；前端已使用 Stored Skill API；`skill_configs` 迁移后废弃 |
| Agent 实例化时机 | **延迟到 Run 开始时** | 配置变更在新 Run 中立即生效，不需要重启 |
| 旧数据迁移 | **先备份 → 预览 → 迁移 → 可回滚** | 符合 PRD 产品原则 1「单一事实来源」和风险缓解要求 |

---

## 三、架构设计

### 3.1 目标架构

```
                         ┌─────────────────────────────┐
                         │     Mastra Stored Agent      │
                         │     (Editor DB - 权威源)      │
                         │  ┌───────────────────────┐   │
                         │  │ Agent CRUD / Version  │   │
                         │  │ Skills / Tools 绑定   │   │
                         │  └───────────┬───────────┘   │
                         └──────────────┼───────────────┘
                                        │
                    ┌───────────────────┼───────────────────┐
                    ▼                   ▼                   ▼
              ┌──────────┐      ┌──────────────┐    ┌──────────────┐
              │ Agent    │      │ Tool Catalog  │    │ Skill        │
              │ Catalog  │      │ (tool_configs)│    │ (Workspace)  │
              │ Adapter  │      │               │    │              │
              └────┬─────┘      └──────┬───────┘    └──────┬───────┘
                   │                   │                   │
                   ▼                   ▼                   ▼
              ┌──────────────────────────────────────────────────┐
              │          instantiateAgent (延迟实例化)             │
              │  Run 开始时: 读取最新 Agent + Tool + Skill 配置    │
              │  → getToolsByIds (async, 读 DB)                   │
              │  → Workspace.getSkill()                           │
              └──────────────────────────────────────────────────┘
                                        │
                                        ▼
              ┌──────────────────────────────────────────────────┐
              │              Mastra Runtime                       │
              │  agents: { ...instantiated }                     │
              │  Team Execution / Chat / Playground              │
              └──────────────────────────────────────────────────┘
```

### 3.2 Agent Catalog Adapter（统一适配层）

```typescript
// apps/agent-server/src/mastra/agents/agent-catalog.ts (新建)

/**
 * Agent Catalog 适配器
 *
 * 将 Mastra Stored Agent (权威源) 的数据适配为 AgentConfig 格式，
 * 供 Team 引用、Agent 实例化和列表展示使用。
 *
 * agent_configs 表保留为只读兼容层，启动时自动迁移到 Stored Agent。
 */
export interface UnifiedAgentEntry {
  id: string;
  name: string;
  description: string;
  instructions: string;
  model: string;
  toolIds: string[];
  skillIds: string[];
  memoryEnabled: boolean;
  metadata?: Record<string, unknown>;
  source: 'stored' | 'legacy';     // 来源标识
  status: 'available' | 'error';   // 加载状态
  errorMessage?: string;
  updatedAt: string;
}

export async function listUnifiedAgents(): Promise<UnifiedAgentEntry[]>
export async function getUnifiedAgent(id: string): Promise<UnifiedAgentEntry | null>
export async function instantiateAgentFromCatalog(id: string): Promise<Agent | null>
```

### 3.3 延迟实例化与热更新

```typescript
// apps/agent-server/src/mastra/agents/agent-runtime-registry.ts (新建)

/**
 * Agent 运行时注册中心
 *
 * 替代 index.ts 中启动时一次性 loadAllAgents() 的模式。
 * 采用「按需实例化 + 缓存失效」策略：
 * - getAgent(id): 首次调用时从 Catalog 读取配置并实例化，缓存结果
 * - invalidateAgent(id): 配置变更时清除缓存，下次调用重新实例化
 * - invalidateAll(): 批量失效（如迁移完成后）
 */

class AgentRuntimeRegistry {
  private cache: Map<string, Agent> = new Map();
  private mastra: Mastra;

  async getAgent(id: string): Promise<Agent | null> {
    if (this.cache.has(id)) return this.cache.get(id)!;
    const agent = await instantiateAgentFromCatalog(id);
    if (agent) this.cache.set(id, agent);
    return agent;
  }

  invalidateAgent(id: string): void {
    this.cache.delete(id);
  }

  invalidateAll(): void {
    this.cache.clear();
  }

  async listAvailableAgents(): Promise<string[]> {
    return (await listUnifiedAgents()).map(a => a.id);
  }
}
```

### 3.4 统一 Tool 获取（接入 DB）

```typescript
// apps/agent-server/src/mastra/tools/tool-registry.ts (重构)

/**
 * 根据 ID 列表获取工具对象映射 (统一入口)
 *
 * 1. 查询 tool_configs DB 获取 ToolConfig
 * 2. 过滤掉未启用的工具
 * 3. 通过 ToolFactory 根据 type 动态创建
 * 4. 内置工具兜底: 如果 DB 中没有配置，从 toolRegistry 取
 */
export async function getToolsByIds(ids: string[]): Promise<Record<string, any>> {
  const allConfigs = await listToolConfigs();
  const configMap = new Map(allConfigs.map(c => [c.id, c]));

  const tools: Record<string, any> = {};
  for (const id of ids) {
    const config = configMap.get(id);
    if (config) {
      if (!config.enabled) continue; // 跳过已停用工具
      const toolMap = await createToolFromConfig(config);
      if (toolMap) Object.assign(tools, toolMap);
    } else {
      // 兜底: DB 中没有配置，尝试从代码注册表取
      const builtin = (toolRegistry as Record<string, any>)[id];
      if (builtin) tools[id] = builtin;
    }
  }
  return tools;
}
```

### 3.5 引用关系检查

```typescript
// apps/agent-server/src/mastra/agents/agent-reference-checker.ts (新建)

export interface AgentReference {
  type: 'team-member' | 'team-supervisor' | 'agent-subagent' | 'workflow';
  entityId: string;
  entityName: string;
  entityUrl: string;  // 可跳转链接
}

export async function checkAgentReferences(agentId: string): Promise<AgentReference[]> {
  const refs: AgentReference[] = [];

  // 1. 检查 agent_teams 中的 members 和 supervisorAgentId
  const teams = await listTeamConfigs();
  for (const team of teams) {
    if (team.supervisorAgentId === agentId) {
      refs.push({ type: 'team-supervisor', entityId: team.id, entityName: team.name, entityUrl: `/teams/${team.id}` });
    }
    const member = team.members.find(m => m.agentId === agentId);
    if (member) {
      refs.push({ type: 'team-member', entityId: team.id, entityName: team.name, entityUrl: `/teams/${team.id}` });
    }
  }

  // 2. 检查其他 Agent 的 subAgentIds
  const agents = await listUnifiedAgents();
  for (const agent of agents) {
    if (agent.id === agentId) continue;
    // 检查 Mastra Stored Agent 中的 agent 依赖
    // (通过 mastra.getAgent(id).agents 获取子 agent 列表)
  }

  return refs;
}
```

---

## 四、实施计划

### Phase 1: Agent 统一目录基础（US-CAT-001 核心）

**目标**：建立 Agent Catalog 适配器，统一 Mastra Stored Agent 和 `agent_configs` 数据源，实现延迟实例化。

| # | 任务 | 文件 | 说明 |
|---|------|------|------|
| 1.1 | 扩展 shared schema | `packages/shared/src/schemas/agent-config.ts` | 新增 `UnifiedAgentEntrySchema`，包含 `source`、`status`、`errorMessage`、`skillIds` 字段 |
| 1.2 | 新建 Agent Catalog 适配器 | `apps/agent-server/src/mastra/agents/agent-catalog.ts` | **新建**：从 Mastra Stored Agent API 读取 Agent 列表，适配为 `UnifiedAgentEntry`；兼容读取 `agent_configs` 旧表并标记 `source: 'legacy'` |
| 1.3 | 新建 Agent 运行时注册中心 | `apps/agent-server/src/mastra/agents/agent-runtime-registry.ts` | **新建**：按需实例化 + 缓存失效机制，替代启动时 `loadAllAgents()` |
| 1.4 | 重构 Mastra server wiring | `apps/agent-server/src/mastra/index.ts` | 移除启动时 `loadAllAgents()`，改为注册 `AgentRuntimeRegistry`；Mastra `agents` 字段改为空或仅保留 supervisor 占位 |
| 1.5 | 新建 Agent Catalog API 路由 | `apps/agent-server/src/mastra/api/agent-routes.ts` | **新建**：`GET /research/agents`（统一列表）、`GET /research/agents/:id`（详情含 source 和 status） |
| 1.6 | 注册新路由 | `apps/agent-server/src/mastra/index.ts` | 将 `agentRoutes` 加入 `server.apiRoutes` |
| 1.7 | Team 执行引擎适配 | `apps/agent-server/src/mastra/teams/team-execution-engine.ts` | 改为通过 `AgentRuntimeRegistry.getAgent()` 获取 Agent 实例，而非依赖 Mastra 全局 agents 注册表 |

**验证标准**：
- `GET /api/research/agents` 返回统一列表，每个 Agent 有 `source` 和 `status` 字段
- 在 Mastra Studio 中创建新 Agent 后，调用 API 能在 5 秒内看到该 Agent（无需重启）
- Team 执行时能正确获取到最新实例化的 Agent

**风险与缓解**：
- Mastra `agents` 字段为空可能导致 Playground 和 Chat 功能异常 → 保留 supervisor agent 的同步初始化，其他 Agent 按需加载
- `@mastra/client-js` 的 Stored Agent API 类型可能变化 → 参考 Mastra skill 文档核对

---

### Phase 2: Tool 统一目录与热更新（US-CAT-003 核心）

**目标**：让 `getToolsByIds` 接入 `tool_configs` DB，Tool 配置变更在新 Run 中立即生效。

| # | 任务 | 文件 | 说明 |
|---|------|------|------|
| 2.1 | 重构 `getToolsByIds` 为异步 | `apps/agent-server/src/mastra/tools/tool-registry.ts` | 改为 async，从 `tool_configs` DB 读取配置，通过 `ToolFactory` 动态创建；保留 `toolRegistry` 作为内置工具兜底 |
| 2.2 | 更新 `instantiateAgent` | `apps/agent-server/src/mastra/agents/agent-registry.ts` | `instantiateAgent` 改为 async，`await getToolsByIds()`；跳过已停用工具 |
| 2.3 | 更新 Catalog 实例化 | `apps/agent-server/src/mastra/agents/agent-catalog.ts` | `instantiateAgentFromCatalog()` 内部调用 async `getToolsByIds` |
| 2.4 | Tool 变更通知 | `apps/agent-server/src/mastra/api/tool-routes.ts` | 在 `createToolRoute`、`updateToolRoute`、`deleteToolRoute` 的 handler 中，操作成功后调用 `agentRuntimeRegistry.invalidateAll()` |
| 2.5 | 停用工具的 UI 反馈 | `apps/agent-server/src/mastra/agents/agent-catalog.ts` | 实例化时如果 Agent 绑定的某 Tool 已停用，在 `UnifiedAgentEntry.status` 中标记 warning，不阻止其他工具加载 |
| 2.6 | Tool 执行历史（基础版） | `apps/agent-server/src/mastra/tools/tool-execution-history.ts` | **新建**：记录最近 Tool 调用的时间、状态、延迟和错误，存入 DB（`tool_execution_history` 表），Tool 详情页展示 |
| 2.7 | Tool 执行历史 API | `apps/agent-server/src/mastra/api/tool-routes.ts` | 新增 `GET /research/tools/:id/history` 端点 |

**验证标准**：
- 在 UI 中创建 HTTP 工具，绑定到 Agent，发起测试 Run，Agent 能成功调用该工具
- 在 UI 中停用一个 Tool，新 Run 中 Agent 不再获得该工具
- 更新 Tool 配置后，下一次调用使用最新版本
- Tool 详情页展示最近执行状态、延迟和失败率

**关键改动点**：
- `tool-registry.ts` 的 `getToolsByIds` 从同步改为异步，需搜索所有调用点并添加 `await`
- `agent-registry.ts` 的 `instantiateAgent` 从同步改为异步，`loadAllAgents` 已是 async

---

### Phase 3: Tool Schema 表单测试（US-CAT-004）

**目标**：根据 Tool 输入 Schema 自动生成测试表单，保留 JSON 高级模式。

| # | 任务 | 文件 | 说明 |
|---|------|------|------|
| 3.1 | JSON Schema 表单生成器 | `apps/desktop/src/renderer/domains/tools/components/schema-form-builder.tsx` | **新建**：根据 `inputSchema` (JSON Schema) 渲染表单字段（text/number/boolean/select/array） |
| 3.2 | 重构 Tool 测试面板 | `apps/desktop/src/renderer/domains/tools/components/tool-test-panel.tsx` | **新建**：替换现有 `ToolExecutor.tsx`，支持 Schema 表单模式和 JSON 模式切换 |
| 3.3 | 表单校验 | 同上 | 提交前使用 Zod 或 JSON Schema validator 校验输入，定位错误字段 |
| 3.4 | 不支持结构的降级 | 同上 | 当 Schema 含 `$ref`、`oneOf` 等复杂结构时，自动切换到 JSON 模式并说明原因 |
| 3.5 | 更新 i18n | `apps/desktop/src/renderer/i18n/locales/{zh-CN,en}/tools.json` | 新增 Schema 表单相关文案 |
| 3.6 | Output Schema 校验 | `apps/agent-server/src/mastra/api/tool-routes.ts` | 测试端点返回结果时，如果 `outputSchema` 存在，校验输出是否符合并返回字段级错误 |

**验证标准**：
- 打开 Tool 测试面板，根据 inputSchema 自动渲染表单字段（含类型、必填、默认值）
- 输入不符合 Schema 时客户端阻止提交并定位错误字段
- JSON 模式下修改有效 JSON 后运行成功
- 复杂 Schema 自动使用 JSON 模式并说明原因
- 测试结果不符合 outputSchema 时展示具体字段错误

---

### Phase 4: Agent 引用关系检查（US-CAT-002）

**目标**：删除 Agent 前检查引用关系，阻止破坏性删除。

| # | 任务 | 文件 | 说明 |
|---|------|------|------|
| 4.1 | 新建引用检查器 | `apps/agent-server/src/mastra/agents/agent-reference-checker.ts` | **新建**：检查 `agent_teams`（member + supervisor）、其他 Agent 的子 agent 引用、Workflow 引用 |
| 4.2 | 引用检查 API | `apps/agent-server/src/mastra/api/agent-routes.ts` | 新增 `GET /research/agents/:id/references` 端点，返回引用列表 |
| 4.3 | 安全删除 API | `apps/agent-server/src/mastra/api/agent-routes.ts` | `DELETE /research/agents/:id` 增加引用检查：有引用时返回 409 + 引用列表；无引用时正常删除 |
| 4.4 | 前端删除确认对话框 | `apps/desktop/src/renderer/domains/agents/components/delete-agent-dialog.tsx` | 重构：先调用引用检查 API，有引用时展示引用列表和跳转链接；无引用时展示确认删除 |
| 4.5 | 唯一成员保护 | `apps/agent-server/src/mastra/agents/agent-reference-checker.ts` | 如果 Agent 是 Team 的唯一成员或唯一 Supervisor，提示必须先指定替代成员 |
| 4.6 | 更新 i18n | `apps/desktop/src/renderer/i18n/locales/{zh-CN,en}/agents.json` | 新增引用检查相关文案 |

**验证标准**：
- Agent 无引用时删除成功并从所有选择器移除
- Agent 被引用时删除被阻止，UI 展示引用实体和可跳转链接
- 解除全部引用后删除成功
- Agent 是 Team 唯一成员时提示必须先指定替代成员

---

### Phase 5: Skill 接入真实运行（US-CAT-005）

**目标**：将 Skill 绑定到 Agent 并在运行时确认已加载，废弃 `skill_configs` 表。

| # | 任务 | 文件 | 说明 |
|---|------|------|------|
| 5.1 | Agent Catalog 读取 Skill 绑定 | `apps/agent-server/src/mastra/agents/agent-catalog.ts` | 从 Mastra Stored Agent 的 `skills` 字段读取已绑定的 Skill ID 列表，填入 `UnifiedAgentEntry.skillIds` |
| 5.2 | 实例化时加载 Skill | `apps/agent-server/src/mastra/agents/agent-catalog.ts` | `instantiateAgentFromCatalog()` 中，通过 `workspace.getSkill(skillId)` 获取 Skill 内容，注入到 Agent 的 instructions 或 metadata |
| 5.3 | Skill 加载验证 | `apps/agent-server/src/mastra/agents/agent-catalog.ts` | 实例化后在 Agent metadata 中记录已加载的 Skill ID 列表，供 Trace 和运行详情确认 |
| 5.4 | Skill 停用/解绑生效 | 同上 | Skill 绑定变更时通过 `agentRuntimeRegistry.invalidateAgent(agentId)` 清除缓存 |
| 5.5 | 旧 skill_configs 标记 | `apps/agent-server/src/mastra/api/skill-routes.ts` | `skill_configs` 中的条目标记 `未接入运行时`，引导用户迁移到 Workspace Skill |
| 5.6 | 前端 Skill 来源展示 | `apps/desktop/src/renderer/domains/agents/components/agent-edit-page/sections/skills-section.tsx` | Agent 详情页展示已绑定 Skill 的来源（Workspace）和版本 |
| 5.7 | 更新 i18n | `apps/desktop/src/renderer/i18n/locales/{zh-CN,en}/skills.json` | 新增迁移提示和来源标记文案 |

**验证标准**：
- 创建合法 Workspace Skill，绑定到 Agent，Agent 详情显示 Skill 来源和版本
- 发起测试 Run，Trace 或运行详情能确认 Skill 已加载
- 停用或解绑 Skill 后，下一次运行 Agent 不再加载该 Skill
- 旧 `skill_configs` 中的条目标记为「未接入运行时」

**关键注意**：
- 需要参考 Mastra Workspace Skill API 确认 `workspace.getSkill()` 的返回类型和用法
- Skill 内容注入方式需要确定：追加到 instructions vs. 作为 metadata（建议追加到 instructions 末尾，用分隔符标记）

---

### Phase 6: 旧配置迁移与回滚（US-CAT-006）

**目标**：将旧 `agent_configs` 和 `skill_configs` 数据安全迁移到 Mastra Stored Agent 和 Workspace Skill。

| # | 任务 | 文件 | 说明 |
|---|------|------|------|
| 6.1 | 迁移检测 API | `apps/agent-server/src/mastra/api/migration-routes.ts` | **新建**：`GET /research/migrations/status` 检测旧表数据量、冲突摘要 |
| 6.2 | 迁移预览 API | 同上 | `POST /research/migrations/preview` 生成迁移预览（ID 冲突、字段映射、跳过项） |
| 6.3 | 备份创建 | `apps/agent-server/src/mastra/migrations/backup.ts` | **新建**：迁移前将 `agent_configs` 和 `skill_configs` 表导出为 JSON 文件，存入 `~/.trading-agent/backups/` |
| 6.4 | 执行迁移 API | `apps/agent-server/src/mastra/api/migration-routes.ts` | `POST /research/migrations/execute`：按预览结果执行迁移（覆盖/跳过/生成新 ID），返回成功/失败/冲突报告 |
| 6.5 | 回滚 API | 同上 | `POST /research/migrations/rollback`：从备份恢复旧表数据，清除迁移产生的 Stored Agent/Skill |
| 6.6 | Agent 迁移逻辑 | `apps/agent-server/src/mastra/migrations/agent-migrator.ts` | **新建**：读取 `agent_configs`，映射为 Stored Agent 格式，通过 Mastra Editor API 创建；ID 冲突时按用户选择处理 |
| 6.7 | Skill 迁移逻辑 | `apps/agent-server/src/mastra/migrations/skill-migrator.ts` | **新建**：读取 `skill_configs`，生成 `SKILL.md` 文件写入 `skills/` 目录，Workspace 自动发现 |
| 6.8 | 前端迁移向导 | `apps/desktop/src/renderer/domains/configuration/components/migration-wizard.tsx` | **新建**：展示待迁移数量 → 预览 → 选择冲突策略 → 执行 → 查看报告 → 可回滚 |
| 6.9 | 更新 i18n | `apps/desktop/src/renderer/i18n/locales/{zh-CN,en}/common.json` | 新增迁移向导相关文案 |

**迁移映射规则**：

```
agent_configs.config          → Mastra Stored Agent
  id                          → stored agent id
  name                        → name
  description                 → description
  instructions                → instructions
  model                       → model (provider/name)
  toolIds                     → tools (Record<string, EntityConfig>)
  memoryEnabled               → memory config
  metadata                    → metadata
  skillIds (如有)              → skills (Record<string, StoredAgentSkillConfig>)

skill_configs.config          → skills/{id}/SKILL.md
  id                          → directory name
  name                        → SKILL.md frontmatter name
  description                 → SKILL.md frontmatter description
  content                     → SKILL.md body
  triggers                    → SKILL.md frontmatter triggers
```

**验证标准**：
- 检测到旧配置时展示待迁移数量和冲突摘要
- 迁移前自动创建可恢复备份文件
- ID 冲突时用户可选择覆盖、跳过或生成新 ID
- 部分失败时成功项保留、失败项可重试，提供错误报告
- 回滚后旧配置恢复且运行时不引用半迁移数据

---

## 五、文件变更清单

### 新建文件

| 文件 | 说明 |
|------|------|
| `apps/agent-server/src/mastra/agents/agent-catalog.ts` | Agent Catalog 适配器（统一数据源） |
| `apps/agent-server/src/mastra/agents/agent-runtime-registry.ts` | Agent 运行时注册中心（延迟实例化 + 缓存） |
| `apps/agent-server/src/mastra/agents/agent-reference-checker.ts` | Agent 引用关系检查器 |
| `apps/agent-server/src/mastra/api/agent-routes.ts` | Agent Catalog REST API 路由 |
| `apps/agent-server/src/mastra/api/migration-routes.ts` | 迁移管理 REST API 路由 |
| `apps/agent-server/src/mastra/migrations/backup.ts` | 迁移备份工具 |
| `apps/agent-server/src/mastra/migrations/agent-migrator.ts` | Agent 配置迁移器 |
| `apps/agent-server/src/mastra/migrations/skill-migrator.ts` | Skill 配置迁移器 |
| `apps/agent-server/src/mastra/tools/tool-execution-history.ts` | Tool 执行历史记录 |
| `apps/desktop/src/renderer/domains/tools/components/schema-form-builder.tsx` | JSON Schema → 表单生成器 |
| `apps/desktop/src/renderer/domains/tools/components/tool-test-panel.tsx` | Tool 测试面板（Schema 表单 + JSON 模式） |
| `apps/desktop/src/renderer/domains/configuration/components/migration-wizard.tsx` | 迁移向导 UI |

### 修改文件

| 文件 | 变更说明 |
|------|----------|
| `packages/shared/src/schemas/agent-config.ts` | 新增 `UnifiedAgentEntrySchema`、`AgentReferenceSchema` |
| `apps/agent-server/src/mastra/index.ts` | 移除启动时 `loadAllAgents()`，注册 `AgentRuntimeRegistry`，添加新路由 |
| `apps/agent-server/src/mastra/tools/tool-registry.ts` | `getToolsByIds` 改为 async，接入 `tool_configs` DB + ToolFactory |
| `apps/agent-server/src/mastra/agents/agent-registry.ts` | `instantiateAgent` 改为 async；保留为 Catalog 适配器的底层实现 |
| `apps/agent-server/src/mastra/teams/team-execution-engine.ts` | 改为通过 `AgentRuntimeRegistry.getAgent()` 获取 Agent |
| `apps/agent-server/src/mastra/api/tool-routes.ts` | 变更操作后调用 `invalidateAll()`；新增 history 端点 |
| `apps/agent-server/src/mastra/api/skill-routes.ts` | 标记旧 `skill_configs` 为「未接入运行时」 |
| `apps/desktop/src/renderer/domains/agents/components/delete-agent-dialog.tsx` | 增加引用检查展示 |
| `apps/desktop/src/renderer/domains/tools/components/ToolExecutor.tsx` | 替换为新的 `tool-test-panel.tsx` |
| `apps/desktop/src/renderer/i18n/locales/zh-CN/*.json` | 新增 Agent、Tool、Skill、迁移相关文案 |
| `apps/desktop/src/renderer/i18n/locales/en/*.json` | 同上 |

---

## 六、Story 验收追踪

### US-CAT-001 使用统一 Agent 目录

| 验收标准 | 对应任务 | 验证方式 |
|----------|----------|----------|
| 统一列表、来源标识、字段所有权，相同 ID 不重复 | 1.2 | `GET /api/research/agents` 返回 `source` 字段 |
| 新建 Agent 5 秒内出现在 Team 选择器 | 1.3, 1.7 | 创建后刷新 Team 选择器 |
| 修改后下一次 Run 使用新配置 | 1.3, 2.4 | 修改 Agent → 发起 Run → 确认新配置生效 |
| 加载失败的 Agent 显示原因 | 1.2 | 故意配置错误 model，列表展示 error 状态 |

### US-CAT-002 安全处理 Agent 引用关系

| 验收标准 | 对应任务 | 验证方式 |
|----------|----------|----------|
| 无引用时删除成功 | 4.3 | 删除未使用的 Agent |
| 有引用时阻止删除并列出引用 | 4.3, 4.4 | 删除被 Team 引用的 Agent |
| 解除引用后删除成功 | 4.3 | 从 Team 移除后重试删除 |
| 唯一成员/Supervisor 提示替代 | 4.5 | 删除 Team 唯一成员 |

### US-CAT-003 使用统一 Tool 目录并让变更实时生效

| 验收标准 | 对应任务 | 验证方式 |
|----------|----------|----------|
| Agent 工具选择器找到 Tool 管理页的 Tool | 2.1 | UI 验证 |
| 停用 Tool 后新 Run 不加载 | 2.1, 2.2 | 停用 → Run → 确认未加载 |
| 更新配置后下次调用使用最新版本 | 2.4 | 更新 HTTP Tool URL → 测试 |
| Output schema 不符时测试失败 | 3.6 | 测试 Tool 返回不符合 schema 的结果 |
| Tool 详情展示执行历史 | 2.6, 2.7 | 查看 Tool 详情页 |

### US-CAT-004 使用 Schema 表单测试 Tool

| 验收标准 | 对应任务 | 验证方式 |
|----------|----------|----------|
| 根据 inputSchema 渲染表单 | 3.1 | 打开测试面板 |
| 不符合 Schema 时阻止提交 | 3.3 | 输入非法值 |
| JSON 模式修改有效 JSON 后运行 | 3.2 | 切换到 JSON 模式 |
| 复杂结构自动使用 JSON 模式 | 3.4 | 含 `$ref` 的 Schema |

### US-CAT-005 将 Skill 接入 Agent 真实运行

| 验收标准 | 对应任务 | 验证方式 |
|----------|----------|----------|
| 绑定 Skill 后 Agent 详情显示来源和版本 | 5.1, 5.6 | Agent 详情页 |
| 测试 Run 确认 Skill 已加载 | 5.2, 5.3 | 查看 Trace |
| 停用/解绑后下次运行不加载 | 5.4 | 解绑 → Run → 确认未加载 |
| 旧 skill_configs 标记「未接入运行时」 | 5.5 | 查看 Skill 列表 |

### US-CAT-006 迁移旧配置且可回滚

| 验收标准 | 对应任务 | 验证方式 |
|----------|----------|----------|
| 展示待迁移数量和冲突摘要 | 6.1, 6.2, 6.8 | 迁移向导首页 |
| 迁移前创建可恢复备份 | 6.3 | 检查 `~/.trading-agent/backups/` |
| ID 冲突时选择覆盖/跳过/新 ID | 6.4, 6.8 | 迁移向导冲突处理 |
| 部分失败时成功保留、失败可重试 | 6.4, 6.6 | 查看迁移报告 |
| 回滚后旧配置恢复 | 6.5 | 执行回滚 → 确认旧数据恢复 |

---

## 七、测试计划

### 单元测试（Vitest）

| 测试文件 | 覆盖范围 |
|----------|----------|
| `apps/agent-server/src/mastra/agents/__tests__/agent-catalog.test.ts` | Catalog 适配器：统一列表、来源标识、加载失败处理 |
| `apps/agent-server/src/mastra/agents/__tests__/agent-reference-checker.test.ts` | 引用检查：Team member、Supervisor、唯一成员 |
| `apps/agent-server/src/mastra/agents/__tests__/agent-runtime-registry.test.ts` | 延迟实例化、缓存失效 |
| `apps/agent-server/src/mastra/tools/__tests__/tool-registry.test.ts` | 异步 getToolsByIds：DB 读取、停用过滤、内置兜底 |
| `apps/agent-server/src/mastra/migrations/__tests__/agent-migrator.test.ts` | Agent 迁移：ID 映射、冲突处理、回滚 |
| `apps/agent-server/src/mastra/migrations/__tests__/skill-migrator.test.ts` | Skill 迁移：SKILL.md 生成 |

### 集成测试（MSW + Vitest）

| 测试文件 | 覆盖范围 |
|----------|----------|
| `apps/desktop/src/renderer/domains/tools/components/__tests__/tool-test-panel.test.tsx` | Schema 表单渲染、JSON 模式切换、校验 |
| `apps/desktop/src/renderer/domains/agents/components/__tests__/delete-agent-dialog.test.tsx` | 引用检查展示、删除确认 |
| `apps/desktop/src/renderer/domains/configuration/components/__tests__/migration-wizard.test.tsx` | 迁移向导完整流程 |

### E2E 测试（Playwright）

| 测试文件 | 覆盖范围 |
|----------|----------|
| `apps/desktop/e2e/tests/agent-catalog.spec.ts` | 创建 Agent → 在 Team 选择器中看到 → 修改后 Run 使用新配置 |
| `apps/desktop/e2e/tests/tool-hot-update.spec.ts` | 创建 HTTP Tool → 绑定 Agent → Run 成功 → 停用 → 新 Run 不加载 |
| `apps/desktop/e2e/tests/agent-delete-protection.spec.ts` | 删除被引用 Agent → 看到引用列表 → 解除引用 → 删除成功 |

---

## 八、风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| Mastra Stored Agent API 类型与预期不符 | Agent Catalog 适配器编译失败 | 先查阅 Mastra skill 文档核对 API；保留 `agent_configs` 兼容层作为降级方案 |
| `getToolsByIds` 改为 async 导致大量编译错误 | 构建失败 | 搜索所有调用点（`grep getToolsByIds`），逐个添加 `await`；优先保证 `instantiateAgent` 链路 |
| 延迟实例化导致首次 Run 延迟增加 | 用户体验下降 | 预热缓存：应用启动时后台异步实例化常用 Agent；缓存 TTL 控制 |
| 迁移过程中数据损坏 | 用户配置丢失 | 迁移前强制备份；迁移使用事务；失败时自动回滚该条目 |
| Mastra Workspace Skill 发现机制不稳定 | Skill 不被加载 | 使用 `checkSkillFileMtime` 已配置；增加启动时 Skill 发现日志 |
| 前端同时存在两套 Agent API（Mastra client + 自建 API） | 数据不一致 | 统一前端只使用 Mastra client API；自建 `/research/agents` 仅用于运行状态展示 |
| Code Tool 安全风险（US-SECURITY-001 依赖） | 安全漏洞 | Code Tool 在安全沙箱完成前默认关闭；此 Phase 中 Code Tool 仅支持查看和配置，不支持执行 |

---

## 九、依赖与前置条件

```text
EN-P0-001 (恢复可信 CI 基线)
  └─→ Phase 1 (Agent 统一目录)
        └─→ Phase 2 (Tool 统一目录)
              └─→ Phase 3 (Schema 表单测试)
        └─→ Phase 4 (引用关系检查)

Phase 1 + Phase 2
  └─→ Phase 5 (Skill 接入运行)

Phase 1 + Phase 5
  └─→ Phase 6 (旧配置迁移)
```

- **EN-P0-002（统一校验和错误格式）**：所有新 API 路由应遵循统一错误格式，建议与 EN-P0-002 并行开发。
- **US-SECURITY-001/002（安全门禁）**：Code Tool 和 HTTP Tool 的安全限制可与 Phase 2 并行开发，不阻塞 Epic A 主体。

---

## 十、交付检查清单

- [ ] `npm run typecheck` 全部通过
- [ ] `npm run test:run` 全部通过
- [ ] `npm run build -w @trading-agent/shared` 通过
- [ ] `npm run build -w @trading-agent/agent-server` 通过
- [ ] `npm run build -w @trading-agent/desktop` 通过
- [ ] 新增 API 使用 `packages/shared` Zod Schema 校验
- [ ] UI 文案同时提供 `zh-CN` 和 `en` 翻译
- [ ] 关键路径具备单元测试或 MSW 集成测试
- [ ] Agent 创建 → Team 选择 → Run 执行 主流程具备 E2E 覆盖
- [ ] Trace、日志不包含密钥或敏感请求头
- [ ] 迁移功能具备备份和回滚能力
