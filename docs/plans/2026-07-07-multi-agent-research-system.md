# 个人 AI 投研 Multi-Agent 系统 — 实施计划

> **日期**: 2026-07-07
> **状态**: Draft
> **产品定位**: 个人 AI 投研 multi-agent 系统，支持配置多角色 agent 及多 agent 协同投研。

---

## 一、现状分析

### 已有基础设施

| 模块 | 现状 | 文件 |
|------|------|------|
| 子 Agent | 4 个硬编码角色（技术信号、市场结构、情绪面、风险检查） | `agents/trading-agent.ts` |
| Supervisor | `researchSupervisor` 通过 Mastra `agents` 属性委派子 agent | `agents/research-supervisor.ts` |
| Workflow | `tradingWorkflow` 三步流水线（取数→Council→综合报告） | `workflows/trading-workflow.ts` |
| 工具 | 2 个工具（Yahoo 行情、技术指标计算） | `tools/market-data-tool.ts`, `tools/technical-analysis-tool.ts` |
| 共享 Schema | KLine、Indicators、TradeSignal、AgentOpinion、ResearchReport | `packages/shared/src/index.ts` |
| 桌面端 | 完整的 agent-builder / agents / workflows 管理 UI | `apps/desktop/src/renderer/domains/` |
| MCP Server | 暴露 2 个工具 | `mcps/trading-mcp-server.ts` |
| 存储 | LibSQL + MastraCompositeStore + MastraEditor (DB-backed) | `index.ts` |

### 核心技术债

1. **Council 步骤是假调用**：`councilAnalysis` step 中的 4 个角色分析用的是 `analyzeTechnical()`、`analyzeMarketStructure()` 等规则函数，不是真正的 `agent.generate()` 调用。多 agent 协同没有真正跑通。
2. **Supervisor fallback 几乎必然触发**：`synthesizeReport` 中 supervisor agent 返回 JSON 的解析逻辑脆弱（正则匹配），稍有格式偏差就 fallback 到规则推导。
3. **Agent 定义完全硬编码**：所有 agent 的 instructions、tools、model 都写在源码里，用户无法配置。
4. **工作流固定不可配**：只有一个 `tradingWorkflow`，步骤、顺序、参与的 agent 全部写死。

---

## 二、产品定位拆解

> 个人 AI 投研 multi-agent 系统，支持配置多角色 agent，以及多 agent 协同投研。

### 三大核心能力

#### 能力 1：多角色 Agent 配置

用户可以像搭积木一样创建投研团队：

- 创建一个"价值投资分析师"角色 → 配置 instructions + 绑定工具 + 选模型
- 创建一个"宏观分析师"角色 → 配置 instructions + 绑定工具
- 从模板库选一个"期权策略分析师" → 微调参数
- 删除不需要的"情绪面分析员"

**设计原则**：
- **模板优先 + 高级自定义**：预置投研角色模板库，用户可基于模板创建也可从零自定义
- Agent 定义存储在数据库中，运行时动态加载（利用已有的 `MastraEditor`）
- 每个 Agent 配置包含：角色名、instructions、绑定的工具、模型、memory 配置、focus 标签、badges

#### 能力 2：多 Agent 协同投研

用户可以组织 agent 团队协同完成投研任务，支持多种协作模式：

| 模式 | 执行方式 | 适用场景 | 优先级 |
|------|---------|---------|--------|
| **Council（圆桌会议）** | N 个 agent 并行分析同一标的，Supervisor 汇总 | 个股深度分析 | P0 |
| **Pipeline（流水线）** | N 个 agent 串行，上游输出是下游输入 | 宏观→行业→个股 | P0 |
| **Debate（辩论）** | 分多空两方 agent 对抗，Supervisor 裁决 | 关键持仓决策 | P1 |
| **Hierarchical（层级委派）** | Supervisor 动态拆解任务并委派 | 复杂投研任务 | P1 |
| **Parallel Scan（并行扫描）** | N 个 agent 分别扫描不同标的 | 自选股批量筛选 | P2 |

用户视角：
- 选 3 个 agent + "Council 模式" → 对 AAPL 做多角色圆桌讨论
- 选 2 个 agent + "Pipeline 模式" → 宏观→行业→个股 串行分析
- 保存为"我的投研工作流模板" → 下次一键复用

#### 能力 3：投研产出管理

- 查看标的的历史投研报告列表
- 对比不同时间点的报告，追踪结论变化
- 报告关联跟踪条件，条件触发时提醒
- 导出报告为 PDF / Markdown

---

## 三、架构设计

### 整体架构

```
┌───────────────────────────────────────────────────────────┐
│                     桌面端 (Electron)                       │
│  ┌───────────┐  ┌───────────┐  ┌───────────┐  ┌────────┐ │
│  │ Agent     │  │ 投研工作流  │  │ 投研报告   │  │ 自选股 │ │
│  │ 管理台    │  │ 编排器     │  │ 中心      │  │ 看板   │ │
│  └─────┬─────┘  └─────┬─────┘  └─────┬─────┘  └───┬────┘ │
│        │              │              │             │       │
└────────┼──────────────┼──────────────┼─────────────┼───────┘
         │              │              │             │
         ▼              ▼              ▼             ▼
┌───────────────────────────────────────────────────────────┐
│                   Agent Server (Mastra)                     │
│                                                             │
│  ┌──────────────┐  ┌───────────────┐  ┌─────────────────┐ │
│  │ Agent        │  │ Workflow      │  │ Report          │ │
│  │ Registry     │  │ Engine        │  │ Storage         │ │
│  │ (DB-backed)  │  │ (Patterns)    │  │ (LibSQL)        │ │
│  └──────┬───────┘  └──────┬───────┘  └─────────────────┘ │
│         │                 │                                 │
│         ▼                 ▼                                 │
│  ┌───────────────────────────────────────┐                 │
│  │         Tool Registry                 │                 │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ │                 │
│  │  │ 行情数据 │ │ 技术指标 │ │ 新闻情绪 │ │                 │
│  │  │ (Yahoo) │ │(MA/RSI) │ │ (待接入) │ │                 │
│  │  └─────────┘ └─────────┘ └─────────┘ │                 │
│  │  ┌─────────┐ ┌─────────┐              │                 │
│  │  │ 基本面   │ │ 期权链   │              │                 │
│  │  │ (待接入) │ │ (待接入) │              │                 │
│  │  └─────────┘ └─────────┘              │                 │
│  └───────────────────────────────────────┘                 │
│                                                             │
│  ┌───────────────────────────────────────┐                 │
│  │  MCP Server (对外暴露工具)             │                 │
│  └───────────────────────────────────────┘                 │
└───────────────────────────────────────────────────────────┘
```

### 关键 Schema 设计（packages/shared/src/index.ts 扩展）

```typescript
// ─── Agent 配置 Schema ───────────────────────────────────────

/** Agent 角色配置 — 存储在 DB 中，运行时动态加载 */
export const AgentConfigSchema = z.object({
  id: z.string(),
  name: z.string().describe('角色名称，如 技术信号分析员'),
  description: z.string(),
  instructions: z.string().describe('Agent system prompt'),
  model: z.string().default('deepseek/deepseek-chat'),
  toolIds: z.array(z.string()).describe('绑定的工具 ID 列表'),
  memoryEnabled: z.boolean().default(true),
  metadata: z.object({
    role: z.string(),
    summary: z.string(),
    operatingMode: z.string(),
    focus: z.array(z.string()),
    badges: z.array(z.string()),
  }).optional(),
  isTemplate: z.boolean().default(false),
  createdAt: z.string(),
  updatedAt: z.string(),
});

// ─── 协作模式 Schema ─────────────────────────────────────────

export const CollaborationPatternSchema = z.enum([
  'council',      // 圆桌会议：N 个 agent 并行分析，Supervisor 汇总
  'pipeline',     // 流水线：N 个 agent 串行，上游输出是下游输入
  'debate',       // 辩论：多空两方对抗，Supervisor 裁决
  'hierarchical', // 层级委派：Supervisor 动态拆解任务
  'parallel-scan',// 并行扫描：N 个 agent 分别扫描不同标的
]);

/** 投研工作流配置 */
export const ResearchWorkflowConfigSchema = z.object({
  id: z.string(),
  name: z.string(),
  pattern: CollaborationPatternSchema,
  participantAgentIds: z.array(z.string()).describe('参与的 agent ID 列表'),
  supervisorAgentId: z.string().optional().describe('汇总/裁决 agent ID'),
  symbols: z.array(z.string()).optional().describe('分析标的列表（parallel-scan 模式使用）'),
  createdAt: z.string(),
  updatedAt: z.string(),
});

// ─── 投研报告 Schema（已存在，需扩展） ────────────────────────

export const ResearchReportSchema = z.object({
  id: z.string().optional(),
  symbol: z.string(),
  title: z.string(),
  date: z.string(),
  price: z.number(),
  pattern: CollaborationPatternSchema.optional().describe('使用的协作模式'),
  opinions: z.array(AgentOpinionSchema),
  risks: z.array(RiskItemSchema),
  conclusion: z.string(),
  action: z.enum(['BUY', 'SELL', 'HOLD', 'WATCH']),
  confidence: z.number().min(0).max(1),
  trackingConditions: z.array(TrackingConditionSchema),
  signal: TradeSignalSchema.optional(),
  workflowConfigId: z.string().optional().describe('产生此报告的工作流配置 ID'),
});
```

### 协作模式执行逻辑

```
Council 模式:
  Input: { symbol, agentIds[], supervisorAgentId }
  Execution:
    1. 并行调用每个 agent.generate("分析 {symbol}")
    2. 收集所有 agent 的 AgentOpinion
    3. supervisorAgent.generate("汇总以下观点并产出报告", opinions)
  Output: ResearchReport

Pipeline 模式:
  Input: { symbol, agentIds[] (有序), supervisorAgentId? }
  Execution:
    1. agent[0].generate("分析 {symbol}") → opinion[0]
    2. agent[1].generate("基于上游分析: {opinion[0]}, 继续分析 {symbol}") → opinion[1]
    3. ... 串行传递
    4. supervisorAgent?.generate("汇总", allOpinions) 或最后一步 agent 汇总
  Output: ResearchReport

Debate 模式:
  Input: { symbol, bullAgentIds[], bearAgentIds[], supervisorAgentId }
  Execution:
    1. bull agents 并行产出看多论据
    2. bear agents 并行产出看空论据
    3. supervisor.generate("裁决多空辩论", bullOpinions, bearOpinions)
  Output: ResearchReport

Hierarchical 模式:
  Input: { task, supervisorAgentId, availableAgentIds[] }
  Execution:
    1. supervisor 收到任务，决定委派哪些 agent
    2. supervisor 通过 agents 属性自动委派（Mastra supervisor agent 模式）
    3. supervisor 汇总产出
  Output: ResearchReport

Parallel Scan 模式:
  Input: { symbols[], agentIds[] }
  Execution:
    1. 对每个 symbol，并行调用所有 agent
    2. 汇总每个 symbol 的报告
  Output: ResearchReport[]
```

---

## 四、分阶段实施路线

### Phase 0：修复 Council，让多 Agent 协同真正跑通

**目标**: 消除核心技术债，让现有的 4+1 agent 协同链路真正可用。

**修改文件**:
- `apps/agent-server/src/mastra/workflows/trading-workflow.ts`

**具体任务**:

- [ ] **Step 1: 重写 `councilAnalysis` step — 真正调用 agent**

  将 `analyzeTechnical()`、`analyzeMarketStructure()`、`analyzeSentiment()`、`analyzeRisk()` 四个规则函数替换为真正的 `agent.generate()` 调用。通过 `mastra.getAgent('marketAnalysisAgent')` 等获取 agent 实例，构造包含 symbol、latestPrice、indicators 的 prompt，并行调用。

- [ ] **Step 2: 修复 `synthesizeReport` 的 supervisor JSON 解析**

  Supervisor 返回的 JSON 解析逻辑太脆弱。改进方案：
  1. 优先使用 `agent.generateStructured()` 或 `agent.stream()` + structured output
  2. 加强 JSON 提取逻辑：先 `JSON.parse(text)` 尝试整体解析，再 fallback 正则
  3. 对 supervisor 的 instructions 优化，强调"只输出 JSON，不要额外文本"

- [ ] **Step 3: 验证完整链路**

  ```bash
  npm run dev
  ```
  在 Mastra Studio 中运行 `trading-workflow`，输入 `{"symbol":"AAPL"}`，确认：
  - Council step 中真正调用了 4 个 agent
  - Supervisor step 产出了结构化报告（非 fallback）
  - 报告包含完整的 opinions、risks、conclusion

---

### Phase 1：Agent 配置化

**目标**: Agent 定义从硬编码迁移到数据库存储 + 运行时动态加载，用户可在桌面端管理投研角色。

**修改/新增文件**:
- `packages/shared/src/index.ts` — 新增 `AgentConfigSchema`
- `apps/agent-server/src/mastra/agents/agent-registry.ts` — Agent 注册中心
- `apps/agent-server/src/mastra/agents/agent-templates.ts` — 预置投研角色模板
- `apps/agent-server/src/mastra/index.ts` — 接入动态 agent 加载
- `apps/desktop/src/renderer/domains/agent-builder/` — 投研角色管理 UI 定制

**具体任务**:

- [ ] **Step 1: 设计并添加 AgentConfigSchema 到 shared 包**

  新增 `AgentConfigSchema` 及对应 TypeScript 类型（见架构设计部分）。编译验证 `npx tsc --noEmit`。

- [ ] **Step 2: 创建 Agent 注册中心 `agent-registry.ts`**

  实现：
  - `listAgents()` — 从 DB 读取所有 agent 配置
  - `getAgent(id)` — 读取单个 agent 配置
  - `createAgent(config)` — 创建新 agent 配置
  - `updateAgent(id, config)` — 更新 agent 配置
  - `deleteAgent(id)` — 删除 agent 配置
  - `instantiateAgent(config)` — 将 AgentConfig 实例化为 Mastra Agent 对象（动态绑定 tools、model、instructions）

  利用已有的 `MastraEditor` 和 `MastraCompositeStore` 实现 DB 持久化。

- [ ] **Step 3: 创建预置投研角色模板 `agent-templates.ts`**

  将现有的 4 个硬编码 agent 转换为模板：
  - 技术信号分析员（trading-agent）
  - 市场结构分析员（market-analysis-agent）
  - 情绪面分析员（sentiment-analysis-agent）
  - 风险检查员（risk-analysis-agent）

  新增模板：
  - 价值投资分析师（基本面导向）
  - 成长股分析师（营收增长率、TAM）
  - 宏观分析师（利率、通胀、周期）
  - 期权策略分析师（IV、Greeks）

  每个模板包含完整的 AgentConfig，标记 `isTemplate: true`。

- [ ] **Step 4: 修改 `index.ts` 接入动态 agent 加载**

  启动时从 DB 加载所有 agent 配置，实例化为 Mastra Agent 对象并注册。保留现有硬编码 agent 作为 fallback / 初始化种子数据。

- [ ] **Step 5: 桌面端投研角色管理 UI**

  基于现有 `agent-builder` 域定制：
  - 角色列表页：展示所有投研角色卡片（名称、角色、badges、focus）
  - 角色创建/编辑表单：instructions 编辑器、工具选择器、模型选择器
  - 模板库页面：浏览预置模板，一键创建
  - 角色测试聊天：创建/编辑后直接测试对话

---

### Phase 2：协作模式可配置

**目标**: 支持用户选择 agent 团队 + 协作模式，一键执行投研任务。

**修改/新增文件**:
- `packages/shared/src/index.ts` — 新增 `CollaborationPatternSchema`, `ResearchWorkflowConfigSchema`
- `apps/agent-server/src/mastra/workflows/collaboration-engine.ts` — 协作模式执行引擎
- `apps/agent-server/src/mastra/workflows/trading-workflow.ts` — 重构为基于配置的动态工作流
- `apps/agent-server/src/mastra/index.ts` — 注册动态工作流
- `apps/desktop/src/renderer/domains/` — 投研工作流编排器 UI

**具体任务**:

- [ ] **Step 1: 设计协作模式 Schema**

  新增 `CollaborationPatternSchema` 和 `ResearchWorkflowConfigSchema`（见架构设计部分）。编译验证。

- [ ] **Step 2: 创建协作执行引擎 `collaboration-engine.ts`**

  实现各模式的执行逻辑：

  ```typescript
  export async function executeCollaboration(
    config: ResearchWorkflowConfig,
    mastra: Mastra
  ): Promise<ResearchReport>
  ```

  - `executeCouncil()` — 并行调用 agent，supervisor 汇总
  - `executePipeline()` — 串行调用，上游传递给下游
  - `executeDebate()` — 多空对抗，supervisor 裁决
  - `executeHierarchical()` — supervisor 动态委派（复用 Mastra supervisor agent 模式）
  - `executeParallelScan()` — 多标的并行扫描

  每个模式产出的 `AgentOpinion[]` 最终由 supervisor 或最后一步 agent 汇总为 `ResearchReport`。

- [ ] **Step 3: 重构 trading-workflow 为动态工作流**

  将 `tradingWorkflow` 从固定三步改为：
  1. `fetchMarketData`（保留，取数步骤不变）
  2. `executeCollaboration`（新增，根据配置执行协作模式）
  3. `synthesizeReport`（保留，但改为从协作引擎产出汇总）

  工作流 input schema 扩展为：
  ```typescript
  {
    symbol: string,
    workflowConfigId?: string,  // 可选，指定工作流配置；不指定则用默认 Council
  }
  ```

- [ ] **Step 4: 工作流配置持久化**

  实现 `ResearchWorkflowConfig` 的 CRUD，存储在 DB 中。用户可保存常用的 agent 组合 + 协作模式为模板。

- [ ] **Step 5: 桌面端投研工作流编排器 UI**

  新增页面/组件：
  - **工作流编排页**：
    - 选择协作模式（5 种模式的可视化卡片）
    - 选择参与 agent（从角色库拖拽/勾选）
    - 选择 supervisor agent
    - 输入分析标的
    - 一键执行
  - **工作流模板管理**：保存/加载/删除工作流配置
  - **执行进度面板**：实时展示各 agent 的分析进度和产出

---

### Phase 3：数据源扩展

**目标**: 扩展投研可用的数据维度，支撑更丰富的分析场景。

**新增文件**:
- `apps/agent-server/src/mastra/tools/news-sentiment-tool.ts` — 新闻/情绪数据
- `apps/agent-server/src/mastra/tools/fundamentals-tool.ts` — 基本面数据
- `apps/agent-server/src/mastra/tools/options-chain-tool.ts` — 期权链数据（可选）

**具体任务**:

- [ ] **Step 1: 新闻/情绪数据工具**

  接入免费/低成本新闻 API（如 Finnhub free tier、Alpha Vantage news）：
  - Input: `{ symbol: string, limit?: number }`
  - Output: `{ articles: Array<{ title, source, url, publishedAt, sentimentScore }> }`
  - 支持 agent 绑定后自动在分析中引用新闻

- [ ] **Step 2: 基本面数据工具**

  接入基本面 API（如 Yahoo Finance fundamentals、Financial Modeling Prep free tier）：
  - Input: `{ symbol: string, metrics?: string[] }`
  - Output: `{ marketCap, peRatio, pbRatio, revenueGrowth, profitMargin, debtToEquity, ... }`
  - 支撑价值投资分析师角色

- [ ] **Step 3: 更新 MCP Server**

  将新工具注册到 `tradingMcpServer`，对外暴露。

- [ ] **Step 4: 更新 agent 模板**

  为新增工具更新相关 agent 模板的 `toolIds` 配置：
  - 情绪面分析员 → 绑定 `news-sentiment-tool`
  - 价值投资分析师 → 绑定 `fundamentals-tool`
  - 期权策略分析师 → 绑定 `options-chain-tool`（如实现）

---

### Phase 4：投研产出管理

**目标**: 投研报告可持久化、可检索、可对比、可导出。

**修改/新增文件**:
- `apps/agent-server/src/mastra/tools/report-storage-tool.ts` — 报告存储工具
- `apps/desktop/src/renderer/domains/` — 投研报告中心 UI

**具体任务**:

- [ ] **Step 1: 报告持久化**

  扩展 `ResearchReportSchema` 增加 `id`、`workflowConfigId`、`pattern` 字段。实现报告的存储和查询：
  - `saveReport(report)` — 存储报告
  - `listReports(symbol?)` — 按标的查询报告列表
  - `getReport(id)` — 读取单个报告
  - `deleteReport(id)` — 删除报告

- [ ] **Step 2: 桌面端投研报告中心 UI**

  - **报告列表页**：按标的分组展示历史报告，支持时间筛选
  - **报告详情页**：完整展示报告内容（opinions、risks、conclusion、trackingConditions）
  - **报告对比页**：选择同一标的的 2-3 份报告，对比结论变化
  - **报告导出**：导出为 Markdown / PDF

- [ ] **Step 3: 跟踪条件监控（可选）**

  - 解析报告中的 `trackingConditions`
  - 定时检查条件是否触发（如 RSI 突破阈值、MA 死叉）
  - 触发时在桌面端推送通知

---

## 五、关键决策记录

| 决策点 | 结论 | 理由 |
|--------|------|------|
| Agent 配置灵活度 | 模板优先 + 高级自定义 | 兼顾易用性和灵活性 |
| 优先协作模式 | Council + Pipeline | 最通用，覆盖 80% 场景 |
| 模型策略 | 支持每个 agent 独立配置模型 | Supervisor 可用更强模型，子 agent 用更快模型 |
| 数据源优先级 | 新闻情绪 > 基本面 > 期权链 | 新闻情绪对现有情绪面分析员提升最大 |
| 桌面端定制 | 基于现有 agent-builder 定制投研皮肤 | 复用已有 UI 基础，降低开发量 |
| 存储方案 | 继续使用 LibSQL + MastraEditor | 已接入，无需引入新依赖 |

---

## 六、验收标准

### Phase 0 验收
- [ ] `tradingWorkflow` 运行时，Council step 真正调用了 4 个 agent（可在日志/observability 中确认）
- [ ] Supervisor step 产出结构化报告，不触发 fallback
- [ ] 报告中 opinions 包含各 agent 的真实分析内容

### Phase 1 验收
- [ ] 桌面端可创建新投研角色（自定义 instructions + 绑定工具 + 选模型）
- [ ] 创建的角色在 Mastra Studio 中可见可用
- [ ] 预置模板库包含至少 8 个投研角色模板
- [ ] 角色配置持久化，重启后不丢失

### Phase 2 验收
- [ ] 桌面端可选择 agent 团队 + 协作模式，一键执行投研任务
- [ ] Council 和 Pipeline 模式完全可用
- [ ] 工作流配置可保存为模板，下次一键复用
- [ ] 执行过程中可实时查看各 agent 分析进度

### Phase 3 验收
- [ ] 情绪面分析员绑定新闻工具后，分析中引用实际新闻内容
- [ ] 价值投资分析师绑定基本面工具后，分析中引用 PE/PB/营收增长率
- [ ] 新工具在 MCP Server 中对外暴露

### Phase 4 验收
- [ ] 投研报告持久化存储，按标的可查看历史报告
- [ ] 同一标的的多份报告可对比查看
- [ ] 报告可导出为 Markdown

---

## 七、风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| DeepSeek API 限流/延迟 | 多 agent 并行调用时可能触发限流 | 支持配置重试策略；Pipeline 模式天然串行减少并发 |
| Yahoo Finance 403 | 取数失败 | 已有 curl fallback；Phase 3 可接入备用数据源 |
| Agent 产出 JSON 解析失败 | 报告生成失败 | 使用 `generateStructured()`；保留 fallback 规则推导 |
| 多 agent 调用成本高 | API 费用 | 支持配置每个 agent 的模型；快速扫描用低成本模型 |
| 动态 agent 加载与 Mastra Editor 兼容 | 可能出现注册冲突 | 保留硬编码 agent 作为种子数据；逐步迁移 |

---

> **备注**: 本计划基于 2026-07-07 的代码状态编写。各 Phase 可独立推进，但 Phase 0 是后续所有工作的基础，建议优先完成。
