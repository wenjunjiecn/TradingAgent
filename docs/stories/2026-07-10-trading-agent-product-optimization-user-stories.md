# Trading Agent 产品优化 User Stories

> 状态：Draft  
> 版本：v1.0  
> 日期：2026-07-10  
> 对应 PRD：[Trading Agent 产品优化 PRD](../prd/2026-07-10-trading-agent-product-optimization-prd.md)

## 1. 使用说明

本文档将产品优化 PRD 拆分为可独立验收的 User Stories。故事按产品价值和依赖关系排序，不代表最终 Sprint 排期。

优先级定义：

- P0：阻塞核心体验、运行正确性或发布质量，必须优先完成。
- P1：形成持续投研闭环的重要能力。
- P2：用于长期效果评估和产品深化的能力。

故事角色：

- 投资者：使用系统研究标的、阅读报告并持续跟踪结论。
- 交易者：进行技术分析、批量扫描和风险复盘。
- 配置者：维护 Agent、Team、Tool、Skill 和模型配置。
- 系统维护者：保障运行安全、兼容性、可观测性和发布质量。

## 2. Definition of Ready

一条 Story 进入开发前必须满足：

- 已确认对应 PRD 需求和用户价值。
- 输入、输出和异常状态有明确约定。
- 涉及数据迁移时已有备份和回滚方案。
- 涉及 Mastra API 时已按当前安装版本核对类型和文档。
- 已明确是否需要 shared schema、数据库迁移、API、前端和 E2E 变更。
- 验收标准可以通过自动化测试或确定性的手工步骤验证。

## 3. Definition of Done

一条 Story 完成必须满足：

- 所有验收标准通过。
- 新增或变更的 API 使用 `packages/shared` Zod Schema 校验。
- UI 文案同时提供 `zh-CN` 和 `en` 翻译。
- 不使用模拟进度或静默降级掩盖未实现能力。
- 关键路径具备单元测试或 MSW 集成测试。
- 用户主流程变更具备 Playwright E2E 覆盖。
- Trace、日志和错误响应不包含密钥或敏感请求头。
- `npm run typecheck`、`npm run test:run` 和相关构建命令通过。

## 4. Epic A：统一运行时目录

### US-CAT-001 使用统一 Agent 目录

- 优先级：P0
- 对应需求：FR-CATALOG-001
- 依赖：Agent 权威数据源技术决策

**User Story**

作为配置者，我希望 Agent 页面、Team 成员选择器和实际运行时使用同一个 Agent 目录，以便我确信自己配置的 Agent 就是系统执行的 Agent。

**验收标准**

1. Given 系统同时存在代码定义 Agent 和数据库 Agent，When 用户打开 Agent 列表，Then 系统展示统一列表、来源标识和字段所有权，且相同 ID 不重复出现。
2. Given 用户创建一个新 Agent，When 创建成功，Then 该 Agent 在 5 秒内出现在 Team 成员和 Supervisor 选择器中，无需重启应用。
3. Given 用户修改 Agent 的模型、指令或工具，When 下一次 Run 开始，Then Run 使用修改后的配置版本。
4. Given Agent 加载失败，When 用户查看 Agent 列表，Then 该 Agent 显示不可用原因，而不是从列表中静默消失。

### US-CAT-002 安全处理 Agent 引用关系

- 优先级：P0
- 对应需求：FR-CATALOG-001
- 依赖：US-CAT-001

**User Story**

作为配置者，我希望删除 Agent 前看到它被哪些 Team、Agent 和 Workflow 使用，以免破坏已有研究配置。

**验收标准**

1. Given Agent 没有任何引用，When 用户确认删除，Then Agent 被删除并从所有选择器移除。
2. Given Agent 被一个或多个实体引用，When 用户点击删除，Then 系统阻止删除并列出引用实体及可跳转链接。
3. Given 用户解除全部引用，When 再次删除，Then 删除操作成功。
4. Given Agent 是 Team 的唯一成员或 Supervisor，When 用户尝试解除引用，Then 系统提示必须先指定替代成员。

### US-CAT-003 使用统一 Tool 目录并让变更实时生效

- 优先级：P0
- 对应需求：FR-CATALOG-002
- 依赖：US-CAT-001

**User Story**

作为配置者，我希望 Agent 编辑器和 Tool 管理页使用同一个 Tool 目录，并让 Tool 变更在新运行中立即生效，以便可靠地维护 Agent 能力。

**验收标准**

1. Given Tool 管理页存在一个已启用 Tool，When 用户打开 Agent 工具选择器，Then 可以找到并绑定同一个 Tool ID。
2. Given 用户停用一个 Tool，When 新 Run 开始，Then Agent 不再获得该 Tool，界面显示该绑定已停用。
3. Given 用户更新 HTTP、MCP 或 Code Tool 配置，When 测试成功并保存，Then 下一次调用使用最新版本，无需重启。
4. Given Tool 输出不符合 output schema，When 测试运行完成，Then 测试失败并展示具体字段错误。
5. Given Tool 有执行历史，When 用户打开详情，Then 可以看到最近状态、延迟、失败率和最近错误类别。

### US-CAT-004 使用 Schema 表单测试 Tool

- 优先级：P0
- 对应需求：FR-CATALOG-002
- 依赖：US-CAT-003

**User Story**

作为配置者，我希望系统根据 Tool 输入 Schema 生成测试表单，以便无需手写 JSON 也能验证 Tool，同时保留高级 JSON 模式。

**验收标准**

1. Given Tool 定义了对象型 input schema，When 用户打开测试面板，Then 系统渲染对应字段、类型、必填状态和默认值。
2. Given 用户输入不符合 Schema，When 点击运行，Then 客户端阻止提交并定位错误字段。
3. Given 用户切换到 JSON 模式，When 修改有效 JSON 后运行，Then 系统使用 JSON 内容执行测试。
4. Given Schema 含当前表单不支持的结构，When 打开测试面板，Then 系统自动使用 JSON 模式并说明原因。

### US-CAT-005 将 Skill 接入 Agent 真实运行

- 优先级：P0
- 对应需求：FR-CATALOG-003
- 依赖：Skill 权威数据源技术决策、US-CAT-001

**User Story**

作为配置者，我希望创建的 Skill 能绑定到 Agent 并在测试运行中确认已加载，以便 Skill 管理不是仅用于展示的配置页面。

**验收标准**

1. Given 用户创建了合法 Workspace Skill，When 将其绑定到 Agent，Then Agent 详情显示该 Skill 的来源和版本。
2. Given Agent 已绑定 Skill，When 发起测试运行，Then Trace 或运行详情能够确认 Skill 已加载。
3. Given 用户停用或解绑 Skill，When 下一次运行开始，Then Agent 不再加载该 Skill。
4. Given 旧 `skill_configs` 中存在用户数据，When 执行迁移，Then 用户可以预览迁移结果、冲突和失败项。
5. Given 某条旧 Skill 尚未迁移，When 用户查看该条目，Then 系统明确标记“未接入运行时”。

### US-CAT-006 迁移旧配置且可回滚

- 优先级：P0
- 对应需求：FR-CATALOG-001、FR-CATALOG-003
- 依赖：US-CAT-001、US-CAT-005

**User Story**

作为配置者，我希望旧 Agent 和 Skill 配置可以安全迁移到统一目录，以便升级后保留已有工作成果。

**验收标准**

1. Given 检测到旧配置，When 用户首次进入配置页，Then 系统展示待迁移数量和冲突摘要。
2. Given 用户开始迁移，When 迁移执行，Then 系统先创建可恢复备份。
3. Given ID 冲突，When 系统生成迁移预览，Then 用户可以选择覆盖、跳过或生成新 ID。
4. Given 部分数据迁移失败，When 迁移结束，Then 成功项保留、失败项可重试，并提供错误报告。
5. Given 用户选择回滚，When 回滚完成，Then 旧配置恢复且运行时不引用半迁移数据。

## 5. Epic B：研究 Run 与实时执行

### US-RUN-001 从统一入口发起研究

- 优先级：P0
- 对应需求：FR-RUN-001
- 依赖：US-CAT-001、US-CAT-003

**User Story**

作为投资者，我希望从 Dashboard、行情页或报告页进入同一个“发起研究”流程，以便不用在 Collaboration 和 Team Execute 两套入口之间选择。

**验收标准**

1. Given 用户从某个标的进入发起研究，When 页面打开，Then 标的自动预填且可以修改。
2. Given 用户选择已有 Team，When Team 加载，Then 页面展示成员、Supervisor、模式和默认参数摘要。
3. Given 用户选择临时 Agent 组合，When 配置有效，Then 可以直接创建一次性 Run，而不强制保存 Team。
4. Given 配置缺少可用 Agent、Provider 或必要 Tool，When 用户准备提交，Then 系统阻止执行并给出修复入口。
5. Given Run 创建成功，When API 返回，Then 用户立即进入 Run 详情，不等待研究完成。

### US-RUN-002 查看真实 Agent 执行进度

- 优先级：P0
- 对应需求：FR-RUN-002
- 依赖：US-RUN-001

**User Story**

作为投资者，我希望实时看到每个 Agent 和 Tool 的真实状态，以便判断研究正在进行、卡在哪里以及哪些结果已经可用。

**验收标准**

1. Given Run 正在执行，When Agent 开始或结束，Then 页面在收到服务端事件后更新对应 Agent 状态。
2. Given Agent 正在调用 Tool，When Tool 事件到达，Then 页面展示 Tool 名称、状态和耗时，不泄露敏感参数。
3. Given Agent 输出文本增量，When SSE 到达，Then 用户可以查看流式内容且布局不跳动。
4. Given Supervisor 开始汇总，When事件到达，Then 页面明确区分成员分析与 Supervisor 汇总。
5. Given SSE 暂时断开，When 页面无法接收事件，Then 显示“正在重连”，而不是继续播放模拟进度。

### US-RUN-003 离开页面后继续执行并重新连接

- 优先级：P0
- 对应需求：FR-RUN-003
- 依赖：US-RUN-002

**User Story**

作为投资者，我希望研究在我切换页面或刷新应用后继续执行，并能重新查看最新状态，以免长任务因界面生命周期丢失。

**验收标准**

1. Given Run 正在执行，When 用户切换到其他页面，Then 服务端继续执行 Run。
2. Given 用户刷新或重新打开 Run 详情，When 页面加载，Then 先读取持久化快照，再从最后事件位置继续订阅。
3. Given Run 已在用户离开期间完成，When 用户返回，Then 页面直接展示最终状态和报告入口。
4. Given 应用异常退出导致执行中断，When 应用重启，Then Run 标记为中断并提供重试，不保持永久 running。

### US-RUN-004 取消正在执行的研究

- 优先级：P0
- 对应需求：FR-RUN-003
- 依赖：US-RUN-002

**User Story**

作为投资者，我希望取消不再需要的研究，以便停止后续模型和工具调用并控制时间与成本。

**验收标准**

1. Given Run 处于 queued 或 running，When 用户确认取消，Then Run 进入 cancelled 状态。
2. Given Agent 或 Tool 正在执行，When取消信号到达，Then 系统尽力中止尚未完成的调用，不再启动新 Step。
3. Given 已有部分结果，When Run 被取消，Then 已完成结果继续保留并标记为不完整。
4. Given Run 已完成，When 用户查看操作区，Then 不再显示取消按钮。
5. Given 取消失败，When 服务端返回错误，Then 页面恢复原状态并提供可操作错误信息。

### US-RUN-005 重试失败步骤或重新运行

- 优先级：P0
- 对应需求：FR-RUN-003
- 依赖：US-RUN-003

**User Story**

作为投资者，我希望只重试失败的 Agent，或基于原配置重新执行整个研究，以便快速恢复失败而不浪费已完成工作。

**验收标准**

1. Given 一个 Agent Step 失败，When 用户选择“重试此步骤”，Then 系统创建新的 Step Attempt 并保留旧错误记录。
2. Given 其他 Agent 已成功，When 重试单个 Step，Then 默认复用其他成功结果。
3. Given 用户选择“全部重新运行”，When 确认，Then 系统创建新 Run 并关联原 Run，而不是覆盖历史记录。
4. Given 配置或数据源已变化，When 用户重新运行，Then 新 Run 保存新的配置版本和数据时间。

### US-RUN-006 在部分失败时获得可用报告

- 优先级：P0
- 对应需求：FR-RUN-004
- 依赖：US-RUN-002

**User Story**

作为投资者，我希望单个 Agent 失败时仍能获得基于剩余结果的报告，并清楚知道缺失内容，以便决定是否重试或继续使用。

**验收标准**

1. Given 至少一个成员成功且一个成员失败，When Supervisor 可以完成汇总，Then Run 状态为 partial_failed 并生成报告。
2. Given 报告来自部分结果，When 用户查看报告，Then 顶部展示“不完整分析”提示和失败成员列表。
3. Given 某类数据获取失败，When 报告生成，Then 对应章节标记数据缺失，不生成伪造数值。
4. Given 所有关键成员失败，When 无法形成最低可用结论，Then Run 状态为 failed 且不生成看似正常的报告。

### US-RUN-007 查看研究运行历史

- 优先级：P0
- 对应需求：FR-RUN-001
- 依赖：US-RUN-001

**User Story**

作为投资者，我希望查看和筛选历史 Run，以便找到进行中的任务、失败任务及对应报告。

**验收标准**

1. Given 系统存在历史 Run，When 用户打开研究运行页，Then 默认按创建时间倒序分页展示。
2. Given 用户筛选状态、标的、Team、模式或日期，When 条件应用，Then 列表仅展示匹配 Run。
3. Given Run 仍在执行，When 用户查看列表，Then 状态和进度可实时更新。
4. Given Run 已产生报告，When 用户点击结果，Then 可以打开对应报告。
5. Given Run 失败，When 用户打开详情，Then 可以查看失败步骤、错误类别和重试入口。

### US-RUN-008 查看成本、延迟和 Trace

- 优先级：P1
- 对应需求：FR-RUN-001、非功能需求 11.3
- 依赖：US-RUN-002

**User Story**

作为配置者，我希望查看每次研究的模型、Token、成本、延迟和 Trace，以便比较团队配置并定位性能问题。

**验收标准**

1. Given Provider 返回用量信息，When Run 完成，Then 页面展示总 Token、估算成本和总耗时。
2. Given Run 包含多个 Agent，When 展开详情，Then 可以查看每个 Agent 和 Tool 的耗时与用量。
3. Given Run 有 Trace ID，When 用户点击 Trace，Then 打开对应 Trace 详情。
4. Given Provider 不返回成本信息，When 查看详情，Then 显示“不可用”而不是零成本。

## 6. Epic C：协作模式语义一致性

### US-PATTERN-001 执行 Council 圆桌研究

- 优先级：P0
- 对应需求：FR-PATTERN-001
- 依赖：US-RUN-002

**User Story**

作为投资者，我希望 Council 成员并行提供独立观点，再由 Supervisor 汇总，以便快速获得多视角结论。

**验收标准**

1. Given Team 使用 Council，When Run 开始，Then 所有可用成员并行执行。
2. Given 成员配置了不同权重，When Supervisor 汇总，Then Run 记录中可以验证权重已进入汇总逻辑。
3. Given 成员观点存在分歧，When 报告生成，Then 报告保留分歧，不只保留最终多数意见。
4. Given 成员尚未全部结束，When Supervisor 未被提前配置允许，Then 汇总不得提前开始。

### US-PATTERN-002 执行 Pipeline 流水线研究

- 优先级：P0
- 对应需求：FR-PATTERN-002
- 依赖：US-RUN-002

**User Story**

作为配置者，我希望 Pipeline 严格按照成员顺序传递累计上下文，以便构建可预测的分阶段研究流程。

**验收标准**

1. Given 成员定义了唯一 order，When Run 执行，Then Agent 按 order 串行开始。
2. Given `passThroughContext=true`，When第二个及后续 Agent 执行，Then 输入包含所有已完成上游结果的摘要。
3. Given `passThroughContext=false`，When后续 Agent 执行，Then 不注入上游内容。
4. Given 用户查看 Run，When 展开某个阶段，Then 可以看到输入来源摘要和该阶段输出。

### US-PATTERN-003 执行多轮 Debate

- 优先级：P1
- 对应需求：FR-PATTERN-003
- 依赖：US-RUN-002、Council 和 Pipeline 验收完成

**User Story**

作为投资者，我希望多空 Agent 进行真实的多轮辩论并由 Supervisor 裁决，以便理解结论背后的核心分歧。

**验收标准**

1. Given Team 成员配置 bull、bear 和可选 neutral 阵营，When Debate 开始，Then 每个阵营按配置参与。
2. Given rounds 大于 1，When进入第二轮，Then 每个阵营可以看到对方上一轮观点。
3. Given某一阵营没有成员，When用户保存或运行 Team，Then 系统阻止执行并说明缺失阵营。
4. Given辩论结束，When Supervisor 输出，Then 报告包含主要分歧、裁决依据和少数意见。

### US-PATTERN-004 执行 Hierarchical 动态委派

- 优先级：P1
- 对应需求：FR-PATTERN-004
- 依赖：US-RUN-002、Supervisor 委派能力验证

**User Story**

作为投资者，我希望 Supervisor 根据问题动态选择和委派成员，以便复杂任务不必固定让所有 Agent 执行。

**验收标准**

1. Given Team 使用 Hierarchical，When Run 开始，Then Supervisor 先产生任务拆解和委派计划。
2. Given某个成员未被委派，When Run 执行，Then该成员不会自动运行。
3. Given Supervisor 追加委派，When新任务产生，Then运行详情展示父子关系和执行树。
4. Given委派循环或超过最大步骤，When限制触发，Then Run 停止继续委派并展示限制原因。

### US-PATTERN-005 执行 Parallel Scan

- 优先级：P1
- 对应需求：FR-PATTERN-005
- 依赖：US-RUN-002、并发限制配置

**User Story**

作为交易者，我希望一次扫描多个标的并分别查看结果，以便快速筛选值得进一步研究的机会。

**验收标准**

1. Given 用户输入多个有效标的，When Parallel Scan 开始，Then 每个标的拥有独立状态和结果。
2. Given配置最大并发数为 N，When扫描执行，Then同时运行的目标不超过 N。
3. Given单个标的失败，When其他标的可继续，Then其余扫描不被取消。
4. Given扫描完成，When用户查看结果，Then可以按建议、信心度和风险排序。
5. Given Chat 不支持 Parallel Scan，When用户选择 Chat 模式，Then该选项被禁用且说明原因，不降级为 Council。

## 7. Epic D：基础正确性、设置与安全

### US-SETTINGS-001 安全保存 Provider 密钥

- 优先级：P0
- 对应需求：FR-SETTINGS-001
- 依赖：密钥存储技术决策

**User Story**

作为配置者，我希望 Provider 密钥安全保存并在重启后继续有效，以便无需每次启动重新配置模型。

**验收标准**

1. Given 用户输入 Provider API Key，When保存成功，Then密钥使用系统安全存储持久化，不写入普通数据库 JSON 或 localStorage。
2. Given应用重启，When Provider 状态加载，Then已配置 Provider 仍显示为已连接。
3. Given渲染进程读取 Provider 状态，When请求完成，Then响应不包含完整密钥。
4. Given请求携带任意 `envVar` 名称，When不属于该 Provider 白名单，Then服务端拒绝请求。
5. Given用户删除密钥，When操作成功，Then安全存储和当前运行时中的密钥均被移除。

### US-SETTINGS-002 真实测试 Provider 连接

- 优先级：P0
- 对应需求：FR-SETTINGS-001
- 依赖：US-SETTINGS-001

**User Story**

作为配置者，我希望连接测试真实调用 Provider，以便在运行研究前发现认证、配额或网络问题。

**验收标准**

1. Given有效密钥，When用户点击测试，Then系统发出最小真实请求并显示成功延迟。
2. Given密钥无效，When测试返回认证错误，Then界面显示“认证失败”。
3. Given配额不足，When Provider 返回配额错误，Then界面显示“余额或配额不足”。
4. Given网络不可用，When请求超时，Then界面显示网络错误并允许重试。
5. Given Provider 可用，When模型列表加载，Then列表来自当前运行时 Registry，不使用过期硬编码值。

### US-MARKET-001 查看短周期行情和完整指标

- 优先级：P0
- 对应需求：FR-MARKET-001
- 依赖：无

**User Story**

作为交易者，我希望选择一个月展示周期时仍能看到正确计算的 MA60 和 MACD，以便展示窗口不会破坏指标计算。

**验收标准**

1. Given用户选择 `1mo`，When行情加载，Then服务端获取足够历史数据计算全部指标，只裁剪图表显示范围。
2. Given历史数据不足 60 根，When无法计算指标，Then界面明确显示数据不足，不返回默认零值。
3. Given数据加载成功，When页面展示，Then显示数据来源、最后更新时间、市场时区和延迟状态。
4. Given标的无效、停牌或数据源限流，When请求失败，Then展示不同错误类型和建议动作。

### US-MEMORY-001 真正清除 Team 持久化记忆

- 优先级：P0
- 对应需求：FR-MEMORY-001
- 依赖：当前 Mastra Memory 清除 API 核验

**User Story**

作为配置者，我希望“清除团队记忆”实际删除该 Team 的持久化上下文，以便后续对话不会继续引用已清除内容。

**验收标准**

1. Given Team 存在持久化 Memory，When用户点击清除，Then确认框展示影响范围。
2. Given用户确认清除，When操作完成，Then数据库中的对应线程和消息被删除或清空。
3. Given清除成功，When Team 开始新对话，Then Agent 不再引用旧上下文。
4. Given清除失败，When服务端返回错误，Then界面不显示成功，并保留原 Memory。
5. Given清除成功，When响应返回，Then界面展示删除的线程或消息数量。

### US-SECURITY-001 在隔离环境运行 Code Tool

- 优先级：P0
- 对应需求：FR-SECURITY-001
- 依赖：沙箱执行方案

**User Story**

作为配置者，我希望自定义代码在隔离环境中执行，以便测试或使用 Tool 时不会访问本地文件、主进程和未授权密钥。

**验收标准**

1. Given Code Tool 尝试访问 `process`、模块加载或文件系统，When执行，Then请求被拒绝或对应对象不可访问。
2. Given执行超过 timeout，When超时触发，Then执行单元被终止，而不仅是 Promise 返回超时。
3. Given Code Tool 未通过安全测试，When用户尝试启用，Then系统阻止启用。
4. Given安全沙箱功能不可用，When应用启动，Then Code Tool 默认关闭并显示原因。

### US-SECURITY-002 阻止 HTTP Tool 访问敏感网络

- 优先级：P0
- 对应需求：FR-SECURITY-001
- 依赖：网络策略

**User Story**

作为系统维护者，我希望 HTTP Tool 默认不能访问本机、私有网段和云元数据地址，以便降低 SSRF 和本地数据泄露风险。

**验收标准**

1. Given URL 指向 localhost、环回地址或私有网段，When Tool 测试或执行，Then服务端拒绝请求。
2. Given URL 指向云元数据地址或非 HTTP(S) 协议，When执行，Then服务端拒绝请求。
3. Given域名解析后指向禁止地址，When执行，Then仍然拒绝，不能只检查原始字符串。
4. Given请求被策略阻止，When用户查看错误，Then显示“网络策略禁止”，不暴露内部网络细节。

### EN-P0-001 恢复可信 CI 基线

- 类型：Enabler Story
- 优先级：P0
- 对应需求：测试与发布门禁
- 依赖：无

**目标**

作为系统维护者，我希望类型检查和测试基线全部通过，以便后续 Story 的回归结果可信。

**验收标准**

1. Given完整依赖已安装，When运行 `npm run typecheck`，Then所有 Workspace 通过。
2. Given当前测试集，When运行 `npm run test:run`，Then无失败、无未处理异常。
3. Given playground-ui stories 参与 typecheck，When编译，Then Storybook 类型依赖完整或 stories 被明确排除。
4. Given CI 运行，When任一门禁失败，Then合并被阻止并展示对应 Workspace。

### EN-P0-002 为自定义 API 建立统一校验和错误格式

- 类型：Enabler Story
- 优先级：P0
- 对应需求：数据与接口要求
- 依赖：无

**目标**

作为系统维护者，我希望所有自定义 API 使用共享 Schema 和稳定错误码，以便前端可靠处理验证、认证、数据源和运行错误。

**验收标准**

1. Given请求体不符合共享 Schema，When调用写接口，Then返回 400、稳定 `code`、`message` 和字段级 `details`。
2. Given资源不存在，When读取或修改，Then返回 404 和统一错误结构。
3. Given资源冲突，When创建重复 ID，Then返回 409，而不是通用 500。
4. Given外部 Provider 或数据源失败，When API 返回，Then错误包含可分类 code，不返回原始密钥或请求头。

## 8. Epic E：自选股、跟踪和通知

### US-WATCH-001 跨会话保存自选股

- 优先级：P1
- 对应需求：FR-WATCH-001
- 依赖：本地数据库 Watchlist Schema

**User Story**

作为投资者，我希望自选股保存在本地数据库并跨会话可用，以便更换页面或清理浏览器状态后仍保留关注标的。

**验收标准**

1. Given用户添加标的，When应用重启，Then标的仍在原自选分组中。
2. Given用户从行情页、报告页或 Run 结果添加标的，When操作成功，Then所有入口显示一致状态。
3. Given标的已存在于当前分组，When再次添加，Then不会创建重复项。
4. Given用户创建分组和备注，When重新打开，Then分组顺序和备注被保留。

### US-WATCH-002 查看自选股实时摘要

- 优先级：P1
- 对应需求：FR-WATCH-001
- 依赖：US-WATCH-001、行情数据状态

**User Story**

作为投资者，我希望在 Dashboard 查看自选股价格、涨跌幅和更新时间，以便快速发现需要研究的标的。

**验收标准**

1. Given自选股存在有效行情，When Dashboard 加载，Then展示最新价格、涨跌幅和更新时间。
2. Given行情数据延迟，When展示价格，Then明确标记延迟状态。
3. Given单个标的加载失败，When其他标的成功，Then失败项独立显示错误，不阻塞整个面板。
4. Given用户点击标的，When导航完成，Then打开预填该标的的行情详情。

### US-MONITOR-001 将报告条件转换为跟踪规则

- 优先级：P1
- 对应需求：FR-MONITOR-001
- 依赖：结构化 Tracking Rule Schema

**User Story**

作为投资者，我希望将报告中的自然语言跟踪条件转换成可审查的结构化规则，以便系统能够持续自动检查。

**验收标准**

1. Given报告含自然语言跟踪条件，When用户点击启用，Then系统展示 metric、operator、value、window、schedule 和 action 预览。
2. Given解析结果不完整，When用户确认前，Then系统要求补齐必要字段。
3. Given用户未确认，When离开页面，Then规则不会自动启用。
4. Given用户确认规则，When保存成功，Then规则状态为 active 并关联原报告。
5. Given旧报告条件无法自动转换，When用户启用，Then可以手工创建结构化规则。

### US-MONITOR-002 管理跟踪规则

- 优先级：P1
- 对应需求：FR-MONITOR-001
- 依赖：US-MONITOR-001

**User Story**

作为投资者，我希望查看、暂停、恢复、修改和删除跟踪规则，以便控制系统持续监控的内容。

**验收标准**

1. Given系统存在规则，When用户打开跟踪页，Then可以按状态、标的和来源报告筛选。
2. Given规则已检查，When查看详情，Then显示最近检查时间、当前值和距离阈值。
3. Given用户暂停规则，When后续调度运行，Then该规则不再被评估。
4. Given用户修改阈值，When保存成功，Then下一次评估使用新版本且历史事件不被覆盖。
5. Given用户删除规则，When确认，Then规则停止调度但历史触发事件可保留。

### US-MONITOR-003 接收去重的触发通知

- 优先级：P1
- 对应需求：FR-MONITOR-002
- 依赖：US-MONITOR-002、后台调度技术决策

**User Story**

作为投资者，我希望规则触发时收到桌面通知，并避免同一条件反复提醒，以便及时处理真正重要的变化。

**验收标准**

1. Given active 规则从未满足变为满足，When评估完成，Then系统创建 Tracking Event 并发送桌面通知。
2. Given通知被点击，When应用打开，Then用户进入触发详情并看到原报告、当前值和阈值。
3. Given规则持续满足且仍处于冷却时间，When再次评估，Then不重复发送通知。
4. Given规则先恢复正常后再次触发，When满足重新触发条件，Then创建新的事件。
5. Given用户关闭某类通知，When规则触发，Then事件仍记录但不发送桌面通知。

### US-MONITOR-004 从触发事件重新研究

- 优先级：P1
- 对应需求：FR-MONITOR-002
- 依赖：US-MONITOR-003、US-RUN-001、US-REPORT-002

**User Story**

作为投资者，我希望从跟踪触发事件一键使用原 Team 和最新数据重新研究，以便验证原结论是否仍然成立。

**验收标准**

1. Given触发事件关联原报告和 Team，When用户点击重新研究，Then发起研究页预填标的、Team 和原任务摘要。
2. Given原 Agent 或 Tool 已不可用，When页面加载，Then系统提示配置差异并要求用户修复或替换。
3. Given新 Run 完成，When新报告生成，Then自动关联原报告和触发事件。
4. Given关联成功，When用户打开结果，Then默认进入新旧报告对比视图。

## 9. Epic F：报告可信度与复用

### US-REPORT-001 查看报告来源和数据快照

- 优先级：P1
- 对应需求：FR-REPORT-001
- 依赖：US-RUN-002、报告 Schema 扩展

**User Story**

作为投资者，我希望报告展示数据来源、采集时间和执行配置，以便判断结论是否有依据以及数据是否过期。

**验收标准**

1. Given报告使用行情、基本面或新闻数据，When用户打开报告，Then可以查看每类数据的来源和获取时间。
2. Given Agent 观点引用新闻或数据，When用户点击引用，Then打开原始 URL 或对应数据快照。
3. Given报告由 Run 生成，When查看元数据，Then展示 Team、Agent、模型、Tool 版本和 Trace ID。
4. Given使用 fallback 或缺失数据，When打开报告，Then顶部明确标识降级和缺失范围。
5. Given外部数据后来变化，When查看旧报告，Then旧报告仍展示生成时快照。

### US-REPORT-002 对比同一标的的历史报告

- 优先级：P1
- 对应需求：FR-REPORT-002
- 依赖：US-REPORT-001

**User Story**

作为投资者，我希望对比同一标的的多份报告，以便理解观点、风险和建议如何随时间变化。

**验收标准**

1. Given同一标的存在至少两份报告，When用户选择 2 至 4 份报告，Then可以进入对比视图。
2. Given报告建议或信心度不同，When对比，Then高亮行动建议、信心度和分析价格变化。
3. Given观点、风险或跟踪条件发生变化，When对比，Then显示新增、删除和修改内容。
4. Given存在可用行情，When对比，Then展示报告期间标的及基准价格变化。
5. Given报告标的不同，When用户尝试加入同一对比，Then系统阻止并说明仅支持同标的对比。

### US-REPORT-003 导出 Markdown 和 PDF

- 优先级：P1
- 对应需求：FR-REPORT-003
- 依赖：US-REPORT-001

**User Story**

作为投资者，我希望将报告导出为 Markdown 或 PDF，以便离线阅读、归档和分享。

**验收标准**

1. Given报告加载成功，When用户选择 Markdown 导出，Then文件包含完整报告、来源、生成时间和免责声明。
2. Given用户选择 PDF，When导出完成，Then内容布局可读且分页不截断关键表格或标题。
3. Given报告包含敏感执行信息，When导出，Then API Key、请求头和内部错误堆栈被移除。
4. Given导出失败，When系统返回错误，Then页面显示失败原因并允许重试。

### US-REPORT-004 持久化报告追问线程

- 优先级：P1
- 对应需求：FR-REPORT-004
- 依赖：Report Thread 数据模型

**User Story**

作为投资者，我希望报告追问保存为可继续的线程，以便重新打开报告后保留分析过程。

**验收标准**

1. Given用户发送第一条追问，When请求提交，Then系统创建关联 reportId 的线程。
2. Given线程已有消息，When用户重新打开报告，Then可以查看并继续历史对话。
3. Given用户创建多个线程，When打开线程列表，Then可以选择、重命名和删除线程。
4. Given回答引用报告内容或来源，When渲染回复，Then显示可跳转引用。
5. Given用户删除线程，When确认，Then线程消息被删除但原报告不受影响。

### US-REPORT-005 将追问结论保存为报告注释

- 优先级：P1
- 对应需求：FR-REPORT-004
- 依赖：US-REPORT-004

**User Story**

作为投资者，我希望把有价值的追问回答保存为报告注释，以便沉淀补充判断而不篡改原始报告。

**验收标准**

1. Given存在一条 Assistant 回答，When用户点击保存为注释，Then系统创建包含来源消息和时间的注释。
2. Given注释保存成功，When用户查看报告，Then注释与原报告正文明确区分。
3. Given用户编辑注释，When保存，Then保留最后更新时间且不修改原消息。
4. Given用户删除注释，When确认，Then只删除注释，不删除线程消息或原报告。

## 10. Epic G：模拟组合与质量评估

### US-PORTFOLIO-001 记录模拟投资决策

- 优先级：P2
- 对应需求：FR-PORTFOLIO-001
- 依赖：报告来源与行情快照

**User Story**

作为投资者，我希望将报告建议记录为模拟买入、卖出或观察决策，以便在不连接真实券商的情况下复盘表现。

**验收标准**

1. Given用户正在查看报告，When记录模拟决策，Then系统预填标的、报告价格、日期和建议方向。
2. Given用户填写数量、价格和费用，When保存，Then模拟组合现金和持仓正确更新。
3. Given一笔模拟交易关联报告，When查看交易，Then可以返回原报告和 Run。
4. Given用户尝试真实下单，When使用当前功能，Then系统不提供券商连接或订单提交能力。

### US-PORTFOLIO-002 查看组合和基准表现

- 优先级：P2
- 对应需求：FR-PORTFOLIO-001
- 依赖：US-PORTFOLIO-001

**User Story**

作为投资者，我希望查看模拟组合收益、最大回撤和相对基准表现，以便判断研究结论是否带来持续价值。

**验收标准**

1. Given组合存在交易和行情，When用户打开组合，Then展示总收益、已实现、未实现收益和现金。
2. Given用户选择基准，When统计加载，Then展示组合与基准的同期表现。
3. Given数据足够，When风险指标计算，Then展示最大回撤和波动率，并说明计算窗口。
4. Given行情缺失，When无法估值，Then标记受影响持仓和最后可用价格，不使用零值。

### US-EVAL-001 跟踪报告建议后续表现

- 优先级：P2
- 对应需求：FR-EVAL-001
- 依赖：US-REPORT-001、历史行情

**User Story**

作为配置者，我希望跟踪报告发布后多个窗口的价格表现，以便比较不同 Agent、Team、模型和协作模式。

**验收标准**

1. Given报告包含有效价格和时间，When到达 1、5、20、60 个交易日窗口，Then系统记录对应收益和基准收益。
2. Given报告建议为 BUY、SELL、HOLD 或 WATCH，When计算命中率，Then使用已定义且可审计的方向规则。
3. Given用户按 Team、Agent、模型或模式筛选，When统计加载，Then展示样本量和指标。
4. Given样本量低于配置阈值，When展示排名，Then系统警告样本不足，不给出强结论。

### US-EVAL-002 查看 AI 研究质量评分

- 优先级：P2
- 对应需求：FR-EVAL-002
- 依赖：US-RUN-008、Dataset 和 Scorer 接入

**User Story**

作为配置者，我希望查看结构化输出、引用、数值一致性和成本评分，以便用证据优化 Agent 和 Team，而不是只凭主观感受。

**验收标准**

1. Given Run 完成，When评分任务执行，Then至少计算 Schema 合法率、Tool 成功率和引用覆盖率。
2. Given报告包含可核对数值，When数值一致性 Scorer 执行，Then比较报告数值和 Tool 输出快照。
3. Given用户比较两个 Team 或模型，When打开评测视图，Then展示质量、延迟、Token、成本和样本量。
4. Given某项评分不可计算，When展示结果，Then标记不可用原因，不默认记为零分。
5. Given评分发现高风险无来源断言，When用户打开详情，Then可以跳转到对应报告段落和 Trace。

## 11. Story 依赖顺序

建议按以下顺序交付：

```text
EN-P0-001 + EN-P0-002
  -> US-SETTINGS-001/002 + US-MARKET-001 + US-MEMORY-001
  -> US-CAT-001/003/005
  -> US-CAT-002/004/006
  -> US-RUN-001/002/007
  -> US-RUN-003/004/005/006
  -> US-PATTERN-001/002
  -> US-REPORT-001
  -> US-WATCH-001/002
  -> US-MONITOR-001/002/003/004
  -> US-REPORT-002/003/004/005
  -> US-PATTERN-003/004/005
  -> US-PORTFOLIO-001/002 + US-EVAL-001/002
```

安全 Story `US-SECURITY-001` 和 `US-SECURITY-002` 必须在对应自定义 Tool 被视为正式功能前完成，可与 Catalog 工作并行。

## 12. PRD 追踪矩阵

| PRD 需求 | User Stories |
|---|---|
| FR-CATALOG-001 | US-CAT-001、US-CAT-002、US-CAT-006 |
| FR-CATALOG-002 | US-CAT-003、US-CAT-004 |
| FR-CATALOG-003 | US-CAT-005、US-CAT-006 |
| FR-RUN-001 | US-RUN-001、US-RUN-007、US-RUN-008 |
| FR-RUN-002 | US-RUN-002 |
| FR-RUN-003 | US-RUN-003、US-RUN-004、US-RUN-005 |
| FR-RUN-004 | US-RUN-006 |
| FR-PATTERN-001 | US-PATTERN-001 |
| FR-PATTERN-002 | US-PATTERN-002 |
| FR-PATTERN-003 | US-PATTERN-003 |
| FR-PATTERN-004 | US-PATTERN-004 |
| FR-PATTERN-005 | US-PATTERN-005 |
| FR-SETTINGS-001 | US-SETTINGS-001、US-SETTINGS-002 |
| FR-MARKET-001 | US-MARKET-001 |
| FR-MEMORY-001 | US-MEMORY-001 |
| FR-SECURITY-001 | US-SECURITY-001、US-SECURITY-002 |
| FR-WATCH-001 | US-WATCH-001、US-WATCH-002 |
| FR-MONITOR-001 | US-MONITOR-001、US-MONITOR-002 |
| FR-MONITOR-002 | US-MONITOR-003、US-MONITOR-004 |
| FR-REPORT-001 | US-REPORT-001 |
| FR-REPORT-002 | US-REPORT-002 |
| FR-REPORT-003 | US-REPORT-003 |
| FR-REPORT-004 | US-REPORT-004、US-REPORT-005 |
| FR-PORTFOLIO-001 | US-PORTFOLIO-001、US-PORTFOLIO-002 |
| FR-EVAL-001 | US-EVAL-001 |
| FR-EVAL-002 | US-EVAL-002 |
| 测试与发布门禁 | EN-P0-001 |
| 数据与接口要求 | EN-P0-002 |

## 13. 待产品决策

以下决策会阻塞对应 Story 进入 Ready：

1. Agent 权威数据源：Mastra Editor/Stored Agent 或自建 Catalog。
2. Skill 权威数据源：Mastra Workspace Skill 或自建 Skill Store。
3. Provider 密钥存储：Electron `safeStorage` 或 macOS Keychain。
4. 跟踪调度范围：仅应用运行期间，或提供独立后台服务。
5. P1 首批备用行情、基本面和新闻数据源。
6. Debate、Hierarchical、Parallel Scan 在 P0 中隐藏、禁用还是标记实验性。
