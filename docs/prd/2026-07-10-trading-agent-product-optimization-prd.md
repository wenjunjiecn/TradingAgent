# Trading Agent 产品优化 PRD

> 状态：Draft  
> 版本：v1.0  
> 日期：2026-07-10  
> 适用范围：`apps/agent-server`、`apps/desktop`、`packages/shared` 及相关 Mastra Workspace

## 1. 文档目的

本文档定义 Trading Agent 下一阶段的产品优化方向。目标不是继续增加孤立的 Agent、页面或协作模式，而是提升现有能力的完整性、可信度和可持续使用价值，将当前功能收敛为一条稳定的投研闭环：

```text
自选股/行情发现
  -> 发起研究
  -> 多 Agent 实时执行
  -> 结构化报告与证据
  -> 跟踪条件监控
  -> 触发提醒与重新评估
  -> 建议效果复盘
```

## 2. 背景与现状

项目已经具备以下基础能力：

- Agent 创建、编辑、对话、记忆、工具和技能配置。
- Council、Pipeline、Debate、Hierarchical、Parallel Scan 等团队协作概念。
- 行情、技术指标、基本面和新闻情绪工具。
- 协同研究、Team Execute、Team Chat 和报告追问。
- 报告持久化、行情页面、自选股、Dashboard 和多语言界面。
- Mastra Trace、Metrics、Dataset、Scorer 和 Workflow 等平台能力。

当前主要问题不是功能数量不足，而是功能之间存在断点：

1. Agent、Tool、Skill 存在多套配置和存储来源，用户编辑的对象与运行时执行对象可能不一致。
2. 协同研究与 Team Execute 使用单个长 HTTP 请求，缺少真实进度、取消、恢复和部分失败处理。
3. 部分协作模式在 Chat 场景中发生语义降级，但界面仍按完整能力展示。
4. 报告已经产出跟踪条件，但系统不会持续监控或触发提醒。
5. 报告缺少数据快照、引用来源、版本对比和建议效果复盘。
6. Provider 配置、团队记忆清理和部分行情周期存在用户可直接遇到的功能错误。
7. 自定义投研主流程缺少自动化回归测试，当前全量类型检查和测试基线未通过。

## 3. 产品定位

Trading Agent 定位为本地优先、可配置、可追溯的个人 AI 投研工作台，而不是通用 Agent 开发平台的简单桌面封装。

核心价值主张：

- 用不同专业 Agent 对同一投资问题提供可审查的多视角分析。
- 所有结论可以追溯到数据、工具调用和具体 Agent。
- 研究不是一次性报告，而是能够持续跟踪、触发和复盘的决策过程。
- 用户可以配置 Agent 和团队，但不需要理解底层 Mastra 运行细节。

## 4. 目标与非目标

### 4.1 产品目标

- G1：Agent、Tool、Skill 的编辑结果与实际运行时保持一致，常规修改无需重启应用。
- G2：所有超过 3 秒的研究任务均提供真实执行状态、取消、重试和失败诊断。
- G3：所有对用户开放的协作模式都符合其产品定义，不允许静默降级。
- G4：将报告中的跟踪条件转化为可执行的监控规则和桌面提醒。
- G5：报告能够展示来源、数据时间、执行配置和历史变化。
- G6：建立研究质量、成本、延迟和建议效果的可量化指标。
- G7：恢复可信的类型检查、单元测试和核心 E2E 门禁。

### 4.2 非目标

- 不接入真实券商下单或自动交易。
- 不提供收益保证或将 AI 输出包装为确定性投资建议。
- P0 阶段不扩展新的协作模式。
- P0 阶段不优先扩展更多国家或资产类别。
- 不重新实现 Mastra 已提供的 Agent、Workspace、Memory、Trace、Dataset 和 Scorer 基础能力。

## 5. 目标用户与核心任务

### 5.1 个人投资者

核心任务：快速研究一个标的、理解不同观点、保存结论，并在关键条件变化时得到提醒。

### 5.2 主动交易者

核心任务：查看行情与技术信号、批量扫描标的、形成风险条件，并追踪信号后续表现。

### 5.3 Agent 配置者

核心任务：创建专业 Agent、绑定数据工具和技能、组建团队，并验证配置是否真实生效。

## 6. 产品原则

1. 单一事实来源：同一种实体只能有一个权威配置源。
2. 真实状态优先：不展示模拟进度，不静默降级执行模式。
3. 证据优先：报告结论必须能回到数据、来源和工具调用。
4. 局部失败可恢复：单个 Agent 或数据源失败不应直接丢弃整个研究任务。
5. 本地优先：默认数据保存在用户本机，密钥使用系统安全存储。
6. 渐进复杂度：默认研究流程简单，高级协作参数按需展开。

## 7. 信息架构调整

建议将侧栏收敛为以下结构：

### 投研

- 看板
- 发起研究
- 研究运行
- 报告中心
- 行情与自选
- 跟踪与提醒

### 配置

- Agent
- Team
- Tool
- Skill
- 设置

现有 `/collaboration` 作为“发起研究”的统一入口。用户可以选择已有 Team 或临时选择 Agent，不再需要在 Collaboration 和 Team Execute 之间理解两套类似流程。

`/teams/:teamId/execute` 后续应重定向到预选该 Team 的“发起研究”页面；Team Chat 保留为探索式对话场景。

## 8. 功能需求

### 8.1 P0：统一运行时配置

#### FR-CATALOG-001 Agent 单一目录

- Agent 列表、Agent 编辑器、Team 成员选择器和 Supervisor 选择器必须读取同一个 Agent Catalog。
- 新建、修改、删除 Agent 后，运行时和所有选择器必须在 5 秒内反映变化。
- Agent 删除前必须展示被哪些 Team、Agent 或 Workflow 引用。
- 代码定义 Agent 与数据库覆盖配置需要在界面中明确显示来源和字段所有权。
- 现有 `agent_configs` 数据需要提供一次性迁移或兼容适配，不能静默丢失用户配置。

验收标准：

- 在 Agent 页面创建一个 Agent 后，无需重启即可加入 Team 并执行成功。
- 修改 Agent 模型、指令或工具后，下一次运行使用新配置。
- 删除被 Team 引用的 Agent 时操作被阻止，并展示引用关系。

#### FR-CATALOG-002 Tool 单一目录与热更新

- Agent 编辑器和 Tool 管理页使用同一个 Tool Catalog。
- Tool 启用、停用或更新后，新运行必须立即使用最新配置。
- Tool 测试输入根据 JSON Schema 自动生成表单，同时保留 JSON 高级模式。
- Tool 详情展示最近执行状态、平均延迟、失败率和最近错误。
- 自定义 Tool 必须经过输入 Schema、输出 Schema 和连接测试后才允许启用。

#### FR-CATALOG-003 Skill 接入真实执行

- Skill 管理统一使用 Mastra Workspace/Editor 的 Skill 模型。
- Skill 可以绑定到 Agent，并能在一次测试运行中确认已被加载。
- Skill 详情展示来源、版本、文件、引用 Agent 和最近更新时间。
- 现有仅存储在 `skill_configs` 中的内容需要迁移为 Workspace Skill，或在迁移完成前标记为“未接入运行时”。

验收标准：

- 新建 Skill、绑定 Agent 后，Agent 运行上下文中可观测到该 Skill。
- 停用或解绑 Skill 后，下一次运行不再加载。

### 8.2 P0：研究 Run 与实时执行

#### FR-RUN-001 统一研究 Run

每次协同研究或 Team Execute 必须创建持久化 Run，至少包含：

- `id`
- `status`
- `task`
- `target` 或 `targets`
- `teamId` 或临时 Agent 配置
- `pattern`
- `startedAt`、`completedAt`
- `progress`
- `agentSteps`
- `resultReportIds`
- `error`
- `traceId`
- Token、费用和延迟汇总

Run 状态定义：

```text
queued -> running -> succeeded
                  -> partial_failed
                  -> failed
                  -> cancelled
```

#### FR-RUN-002 实时事件流

服务端必须推送以下事件：

- Run 已创建。
- Agent 开始和结束。
- Tool 调用开始、成功和失败。
- Agent 文本增量。
- Supervisor 汇总开始和结束。
- 报告已保存。
- Run 完成、部分失败、失败或取消。

桌面端必须显示真实状态，禁止使用与服务端执行无关的固定进度动画。

#### FR-RUN-003 取消、恢复与重试

- 用户可以取消正在执行的 Run。
- 页面刷新或切换路由后，可以重新连接并继续查看状态。
- 失败的 Agent Step 可以单独重试。
- 整个 Run 可以基于原配置重新运行。
- 已完成的 Agent 结果默认复用，用户可选择全部重新执行。

#### FR-RUN-004 部分失败

- 单个 Agent 失败时，其余 Agent 继续执行。
- Supervisor 可以基于剩余观点产出报告，但报告必须标记“分析不完整”。
- 数据源失败时必须展示缺失的数据类别，不能用无依据内容填充。

### 8.3 P0：协作模式一致性

#### FR-PATTERN-001 Council

- 成员并行分析。
- Supervisor 在所有可用成员完成后汇总。
- 成员权重必须实际影响汇总 Prompt 或结构化计算。

#### FR-PATTERN-002 Pipeline

- 严格按照 `order` 串行执行。
- `passThroughContext=true` 时传递累计上下文，而不是只传递最后一个成员的结果。
- 用户可以查看每一阶段的输入摘要与输出。

#### FR-PATTERN-003 Debate

- 按 bull、bear、neutral 阵营执行。
- `rounds` 必须真实控制辩论轮次。
- 第二轮及后续轮次必须能够看到对方上一轮观点。
- Supervisor 输出分歧点、裁决依据和少数意见。

#### FR-PATTERN-004 Hierarchical

- Supervisor 动态拆解任务并选择成员。
- 界面展示委派关系和执行树。
- 未被委派的 Agent 不应自动并行执行。

#### FR-PATTERN-005 Parallel Scan

- 每个目标必须拥有独立的执行状态和报告。
- 支持设置最大并发数。
- 单个目标失败不影响其他目标。
- Chat 场景不支持时应禁用该模式，不允许静默降级为 Council。

### 8.4 P0：基础正确性与首次使用

#### FR-SETTINGS-001 Provider 配置

- API Key 仅允许写入系统定义的 Provider，不接受任意环境变量名称。
- 密钥通过 macOS Keychain 或 Electron `safeStorage` 加密保存。
- 保存后重启应用仍然有效。
- 连接测试必须向 Provider 发出最小真实请求。
- 模型列表从当前运行时 Provider Registry 获取，不维护容易过期的硬编码列表。
- 错误状态需要区分未配置、认证失败、余额/配额不足和网络不可用。

#### FR-MARKET-001 行情周期与指标窗口

- 展示周期和指标计算窗口分离。
- 选择 `1mo` 时，服务端仍获取足够历史数据计算 MA60/MACD，再裁剪为一个月展示。
- 页面显示数据来源、最后更新时间、市场时区和是否延迟。
- 无效代码、停牌、数据不足和数据源限流分别展示可操作错误。

#### FR-MEMORY-001 团队记忆

- “清除记忆”必须删除对应 Team 的持久化 Memory 数据。
- 操作前显示影响范围，完成后显示已删除的线程或消息数量。
- Team Chat 线程需要可列出、重命名、继续和删除。

#### FR-SECURITY-001 自定义工具安全门禁

- Code Tool 必须运行在真正隔离的 Worker/子进程或沙箱中，超时后终止执行单元。
- 不允许通过全局对象访问主进程 `process`、文件系统或模块加载能力。
- HTTP Tool 默认阻止 localhost、私有网段、云元数据地址和非 HTTP(S) 协议。
- 密钥不能作为普通 JSON 明文返回到渲染进程。
- 在安全门禁完成前，Code Tool 默认关闭并显示实验性标记。

### 8.5 P1：自选股与跟踪提醒

#### FR-WATCH-001 持久化自选股

- 自选股保存到本地数据库，而不是仅保存在 `localStorage`。
- 每个标的展示最新价格、涨跌幅、更新时间和数据状态。
- 可以从行情、报告和研究结果一键加入或移除。
- 支持自定义分组和备注。

#### FR-MONITOR-001 结构化跟踪规则

报告中的跟踪条件需要扩展为可执行规则：

```ts
interface TrackingRule {
  id: string;
  reportId: string;
  symbol: string;
  metric: string;
  operator: 'gt' | 'gte' | 'lt' | 'lte' | 'crosses_above' | 'crosses_below' | 'event';
  value?: number;
  window?: string;
  schedule: string;
  action: string;
  status: 'active' | 'paused' | 'triggered' | 'resolved';
  lastValue?: number;
  lastEvaluatedAt?: string;
}
```

- 旧的自然语言阈值继续展示，但必须经用户确认后才能转为自动规则。
- 支持价格、涨跌幅、MA、RSI、MACD、成交量和日期事件。
- 每条规则展示最近检查时间、当前值和距离阈值。
- 用户可以暂停、恢复、修改和删除规则。

#### FR-MONITOR-002 触发与通知

- 规则触发后生成事件记录并发送桌面通知。
- 通知可以打开原报告和触发详情。
- 支持一键使用原 Team 和最新数据重新研究。
- 同一规则需要去重和冷却时间，避免重复通知。

### 8.6 P1：报告可信度与复用

#### FR-REPORT-001 来源与数据快照

报告需要保存：

- 行情、指标、基本面和新闻数据快照。
- 每个数据源的名称、URL、发布时间和获取时间。
- 参与 Agent、模型、工具、Team 配置版本和 Trace ID。
- fallback、缺失数据和失败 Agent 信息。

每个 Agent 观点支持引用来源，用户可以从报告跳转到原始新闻或数据详情。

#### FR-REPORT-002 报告对比

- 支持选择同一标的的 2 至 4 份报告进行对比。
- 对比行动建议、信心度、价格、Agent 观点、风险和跟踪条件。
- 高亮新增、删除和改变的结论。
- 展示报告期间标的和基准的价格变化。

#### FR-REPORT-003 导出

- 支持 Markdown 和 PDF 导出。
- 导出内容包含生成时间、数据来源、免责声明和运行配置。
- 导出不包含 API Key、内部错误堆栈或敏感请求头。

#### FR-REPORT-004 报告追问线程

- 报告追问必须持久化为线程。
- 重新打开报告后可以继续历史对话。
- 回答需要引用报告内容或数据来源。
- 支持将有价值的追问结论追加为报告注释，但不直接覆盖原报告。

### 8.7 P2：组合与研究质量评估

#### FR-PORTFOLIO-001 模拟组合

- 用户可以记录模拟买入、卖出、仓位和基准。
- 报告可以关联到一次模拟决策。
- 展示收益、最大回撤、波动率和相对基准表现。
- 不接入真实下单。

#### FR-EVAL-001 建议效果跟踪

- 跟踪报告发布后 1 日、5 日、20 日和 60 日收益。
- 按 Agent、Team、模式、模型和行动建议聚合表现。
- 区分方向命中率、风险控制效果和绝对收益。
- 明确提示样本量，避免小样本排名误导。

#### FR-EVAL-002 AI 质量评测

利用现有 Dataset、Scorer 和 Trace 能力建立以下评测：

- 结构化输出 Schema 合法率。
- 工具调用成功率。
- 数据引用覆盖率。
- 数值与工具结果一致率。
- 多 Agent 观点保留率。
- 幻觉和无来源断言比例。
- 每次研究的延迟、Token 和成本。

## 9. 核心用户流程

### 9.1 发起单标的研究

1. 用户从 Dashboard、行情页或报告页点击“发起研究”。
2. 系统预填标的，用户选择 Team 或临时 Agent 组合。
3. 用户确认模式和高级参数。
4. 系统立即创建 Run 并进入 Run 详情。
5. 用户实时查看 Agent 和 Tool 状态，可取消或离开页面。
6. Run 完成后生成报告。
7. 用户确认需要启用的跟踪规则。

### 9.2 批量扫描

1. 用户输入多个标的或选择自选股分组。
2. 选择 Parallel Scan Team 和最大并发数。
3. 系统为每个标的展示独立状态。
4. 完成后按行动建议、信心度和风险排序。
5. 用户选择部分结果加入报告对比或继续深度研究。

### 9.3 跟踪触发后重新评估

1. 后台任务检测到规则满足条件。
2. 系统记录触发值并发送桌面通知。
3. 用户打开触发详情，查看原报告与当前数据差异。
4. 用户使用原 Team 一键重新运行。
5. 新报告与原报告自动进入对比视图。

## 10. 数据与接口要求

建议新增或统一以下领域对象：

- `agent_catalog`
- `tool_catalog`
- `workspace_skill`
- `research_runs`
- `research_run_steps`
- `research_run_events`
- `research_reports`
- `report_sources`
- `report_threads`
- `watchlists`
- `tracking_rules`
- `tracking_events`
- `paper_portfolios`
- `paper_transactions`

关键接口建议：

```text
POST   /research/runs
GET    /research/runs
GET    /research/runs/:id
GET    /research/runs/:id/events
POST   /research/runs/:id/cancel
POST   /research/runs/:id/retry

GET    /research/reports/:id/compare
GET    /research/reports/:id/export?format=markdown|pdf
GET    /research/reports/:id/threads

GET    /research/watchlists
POST   /research/tracking-rules
PATCH  /research/tracking-rules/:id
GET    /research/tracking-events
```

所有写接口必须使用 `packages/shared` 中的 Zod Schema 校验。错误响应至少包含稳定的 `code`、用户可读 `message` 和可选 `details`。

## 11. 非功能需求

### 11.1 性能

- Run 创建接口 P95 小于 500ms，不等待实际研究完成。
- 首个流式事件 P95 小于 2 秒，不含 Provider 自身排队时间。
- Dashboard 首屏本地数据 P95 小于 1 秒。
- 报告列表默认只返回摘要并使用分页。

### 11.2 可靠性

- 应用重启后未完成 Run 可以显示为中断并支持重试。
- 数据库写入使用事务，避免报告存在但 Run 状态丢失。
- 外部数据源和 Provider 调用必须设置超时、有限重试和错误分类。
- 不允许用零价格或虚构数据生成看似正常的报告。

### 11.3 可观测性

- 每个 Run、Agent Step 和 Tool Call 关联 Trace ID。
- 记录模式、模型、Agent 版本、Tool 版本、延迟、Token、成本和错误类别。
- Dashboard 提供最近失败 Run 和数据源健康状态。

### 11.4 安全与隐私

- 默认仅监听 `127.0.0.1`。
- API Key 不进入日志、Trace、报告或渲染进程持久化状态。
- Sensitive Data Filter 覆盖自定义 API 和 Tool 执行事件。
- 导出和诊断包必须执行敏感字段清理。

## 12. 成功指标

### 12.1 激活指标

- 首次启动至成功完成首份报告的中位时间小于 10 分钟。
- Provider 配置成功率大于 95%。
- 新建 Agent 后首次 Team 执行成功率大于 90%。

### 12.2 可靠性指标

- 研究 Run 非用户取消成功率大于 95%。
- Run 状态与实际执行状态一致率达到 100%。
- Tool 调用失败必须有可分类原因，未知错误比例低于 5%。
- 支持的协作模式不发生静默降级。

### 12.3 产品价值指标

- 完成报告后启用至少一条跟踪规则的比例大于 30%。
- 跟踪触发后发起重新研究的比例大于 20%。
- 报告对比或追问功能的周使用率大于 25%。
- 有来源引用的报告比例达到 100%。

## 13. 测试与发布门禁

### 13.1 当前基线

- `npm run typecheck` 当前因 playground-ui 缺少 Storybook 类型依赖失败。
- `npm run test:run` 当前 Desktop 有 9 个失败测试和 1 个未处理异常。
- Agent Server 当前仅有技术指标相关测试，核心投研执行路径缺少覆盖。

### 13.2 P0 发布前门禁

- `npm run typecheck` 全部通过。
- `npm run test:run` 全部通过，无未处理 Promise/Rejection。
- Agent Server 覆盖五种协作模式、部分失败、报告保存、Memory 清理和 API 校验。
- Desktop 使用 MSW 覆盖 Run 创建、SSE 更新、取消、重连和失败重试。
- Playwright 覆盖“发起研究 -> 查看进度 -> 打开报告 -> 启用跟踪规则”主流程。
- 打包后的 macOS 应用完成 Provider 密钥持久化和 Workspace Skill 可用性验证。

## 14. 分阶段交付

### Phase 0：基线恢复

- 修复 TypeScript 和现有测试失败。
- 修复 `1mo` 指标、默认标的和持久化 Memory 清理。
- Provider 真实连接测试和安全持久化。
- 为当前核心 API 补充输入校验。

### Phase 1：运行时统一

- 统一 Agent、Tool、Skill Catalog。
- 完成旧数据迁移。
- 配置变更实时生效。
- 清理或重定向重复配置入口。

### Phase 2：研究 Run

- 建立 Run、Step、Event 存储。
- 接入 SSE、取消、重连、重试和部分失败。
- 合并 Collaboration 与 Team Execute 用户流程。
- 补齐或下线语义不完整的协作模式。

### Phase 3：报告与监控闭环

- 数据快照、来源引用、报告对比和导出。
- 跟踪规则、后台调度、触发事件和桌面通知。
- 持久化报告追问线程。

### Phase 4：组合与评测

- 模拟组合和建议效果跟踪。
- Dataset、Scorer、Trace 与投研 Run 打通。
- 建立 Agent、Team、模型和模式的质量对比。

## 15. 风险与缓解

| 风险 | 影响 | 缓解措施 |
|---|---|---|
| 统一 Agent 数据源涉及现有 Editor 和自建表迁移 | 配置丢失或引用失效 | 先做只读兼容层、迁移预览和可回滚备份 |
| 长任务改为 Run 后改动范围较大 | API 和前端状态管理复杂 | 先覆盖单标的 Council，再扩展其他模式 |
| Yahoo/Finnhub 数据不稳定 | 研究失败或数据缺失 | 数据源健康检查、缓存、备用源和明确降级状态 |
| 自动跟踪规则由自然语言生成 | 规则误解析 | 必须由用户确认结构化规则后才能启用 |
| 多 Agent 成本和延迟增长 | 用户等待时间和费用不可控 | 并发上限、预算、超时、缓存和局部重试 |
| Code/HTTP Tool 扩大本地攻击面 | 数据与密钥泄露 | 沙箱、网络策略、权限提示和默认关闭 |

## 16. 待确认事项

1. P0 是否以 Mastra Editor/Stored Agent 作为唯一 Agent 配置源，还是保留自建 Catalog 作为权威源。
2. Provider 密钥使用 Electron `safeStorage` 还是直接接入 macOS Keychain。
3. 跟踪任务仅在桌面应用运行时执行，还是支持独立后台服务。
4. P1 首批备用数据源及其授权和成本边界。
5. 模拟组合是否只支持报告建议记录，还是需要完整的现金和交易流水模型。

## 17. 建议决策

为降低长期维护成本，建议采用以下默认决策：

- Mastra Editor/Stored Agent 作为 Agent 权威配置源。
- Mastra Workspace Skill 作为 Skill 权威配置源。
- 自建 Team、Research Run、Report、Watchlist 和 Tracking Rule 作为产品领域数据。
- 协同研究统一走持久化 Run，Team Chat 保持独立的探索式对话定位。
- P0 仅对外开放 Council 和 Pipeline；Debate、Hierarchical、Parallel Scan 在通过语义验收后逐个开放。
- 先完成监控闭环，再扩展更多数据源、资产类别或自动交易能力。
