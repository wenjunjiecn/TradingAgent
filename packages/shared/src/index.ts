import { z } from 'zod';

// ─── Zod Schemas ────────────────────────────────────────────────────
export const KLineDataSchema = z.object({
  time: z.number().describe('Unix timestamp (seconds)'),
  open: z.number(),
  high: z.number(),
  low: z.number(),
  close: z.number(),
  volume: z.number(),
});

export const IndicatorsSchema = z.object({
  ma20: z.number().describe('20-period Simple Moving Average'),
  ma60: z.number().describe('60-period Simple Moving Average'),
  rsi: z.number().describe('14-period RSI (0-100)'),
  macd: z.number().describe('MACD line (EMA12 - EMA26)'),
  macdSignal: z.number().describe('MACD signal line (EMA9 of MACD)'),
  macdHistogram: z.number().describe('MACD histogram (MACD - Signal)'),
});

export const TradeSignalSchema = z.object({
  symbol: z.string().describe('Stock ticker symbol, e.g. AAPL'),
  action: z.enum(['BUY', 'SELL', 'HOLD']),
  price: z.number().describe('Current price at signal generation'),
  timestamp: z.number().describe('Unix timestamp (ms)'),
  reason: z.string().describe('Human-readable analysis explanation in Chinese'),
  indicators: IndicatorsSchema,
});

export const PositionSchema = z.object({
  symbol: z.string(),
  shares: z.number(),
  entryPrice: z.number(),
  currentPrice: z.number(),
  unrealizedPnl: z.number(),
  unrealizedPnlPct: z.number(),
});

// ─── 投研报告 Schemas ───────────────────────────────────────────────

/** 单个角色 agent 的分析观点 */
export const AgentOpinionSchema = z.object({
  role: z.string().describe('角色名称，如 技术信号分析员、市场结构分析员'),
  summary: z.string().describe('该角色的核心观点摘要（中文）'),
  details: z.string().describe('该角色的详细分析内容（中文）'),
  signal: z.enum(['BUY', 'SELL', 'HOLD', 'WATCH']).optional().describe('该角色给出的方向倾向'),
  confidence: z.number().min(0).max(1).optional().describe('该角色对自己判断的信心度 0-1'),
});

/** 风险项 */
export const RiskItemSchema = z.object({
  category: z.string().describe('风险类别，如 波动风险、事件风险、失效条件'),
  description: z.string().describe('风险描述（中文）'),
  severity: z.enum(['low', 'medium', 'high']).describe('严重程度'),
});

/** 跟踪条件——投研结论需要持续验证的关键变量 */
export const TrackingConditionSchema = z.object({
  metric: z.string().describe('跟踪指标，如 RSI、MA20、财报日期'),
  threshold: z.string().describe('触发条件描述，如 RSI 跌破 30、MA20 下穿 MA60'),
  action: z.string().describe('触发后建议动作，如 重新评估、减仓、止损'),
});

/** 投研报告——Supervisor Agent 的结构化产出 */
export const ResearchReportSchema = z.object({
  id: z.string().optional().describe('报告唯一 ID（持久化时自动生成）'),
  symbol: z.string().describe('标的代码，如 AAPL'),
  title: z.string().describe('报告标题（中文）'),
  date: z.string().describe('报告日期 ISO 8601'),
  price: z.number().describe('分析时的最新价格'),
  opinions: z.array(AgentOpinionSchema).describe('各角色 agent 的分析观点'),
  risks: z.array(RiskItemSchema).describe('风险清单'),
  conclusion: z.string().describe('综合结论（中文），融合各方观点后的研判'),
  action: z.enum(['BUY', 'SELL', 'HOLD', 'WATCH']).describe('综合行动建议'),
  confidence: z.number().min(0).max(1).describe('综合信心度 0-1'),
  trackingConditions: z.array(TrackingConditionSchema).describe('需持续跟踪的关键条件'),
  signal: TradeSignalSchema.optional().describe('可选的技术交易信号'),
  pattern: z.string().optional().describe('使用的协作模式'),
  workflowConfigId: z.string().optional().describe('产生此报告的工作流配置 ID'),
});

// ─── 新闻情绪 Schemas ────────────────────────────────────────────────

/** 新闻文章 */
export const NewsArticleSchema = z.object({
  title: z.string().describe('新闻标题'),
  source: z.string().describe('新闻来源'),
  url: z.string().describe('新闻链接'),
  publishedAt: z.string().describe('发布时间 ISO 8601'),
  summary: z.string().optional().describe('新闻摘要'),
  sentimentScore: z.number().min(-1).max(1).optional().describe('情绪评分 -1(极度看空) 到 1(极度看多)'),
});

/** 新闻情绪分析结果 */
export const NewsSentimentResultSchema = z.object({
  symbol: z.string(),
  articles: z.array(NewsArticleSchema),
  overallSentiment: z.enum(['positive', 'negative', 'neutral']).describe('整体情绪'),
  sentimentScore: z.number().min(-1).max(1).describe('整体情绪评分 -1 到 1'),
  articleCount: z.number().describe('文章数量'),
});

// ─── 基本面 Schemas ──────────────────────────────────────────────────

/** 基本面数据 */
export const FundamentalsSchema = z.object({
  symbol: z.string(),
  marketCap: z.number().optional().describe('市值（美元）'),
  peRatio: z.number().optional().describe('市盈率 P/E'),
  forwardPE: z.number().optional().describe('远期市盈率'),
  pbRatio: z.number().optional().describe('市净率 P/B'),
  psRatio: z.number().optional().describe('市销率 P/S'),
  pegRatio: z.number().optional().describe('PEG 比率'),
  dividendYield: z.number().optional().describe('股息率（百分比）'),
  beta: z.number().optional().describe('Beta 系数'),
  profitMargin: z.number().optional().describe('利润率（小数，如 0.25 = 25%）'),
  revenueGrowth: z.number().optional().describe('营收增长率（小数）'),
  earningsGrowth: z.number().optional().describe('盈利增长率（小数）'),
  debtToEquity: z.number().optional().describe('资产负债率'),
  returnOnEquity: z.number().optional().describe('ROE（小数）'),
  returnOnAssets: z.number().optional().describe('ROA（小数）'),
  currentRatio: z.number().optional().describe('流动比率'),
  freeCashFlow: z.number().optional().describe('自由现金流（美元）'),
  grossMargin: z.number().optional().describe('毛利率（小数）'),
  operatingMargin: z.number().optional().describe('营业利润率（小数）'),
  sector: z.string().optional().describe('所属行业'),
  industry: z.string().optional().describe('所属子行业'),
});

// ─── Agent 配置 Schemas ─────────────────────────────────────────────

/** Agent 元数据 */
export const AgentMetadataSchema = z.object({
  role: z.string().describe('角色分类，如 技术信号、市场结构'),
  summary: z.string().describe('角色一句话描述'),
  operatingMode: z.string().describe('运行模式，如 按需分析、盘前复核'),
  focus: z.array(z.string()).describe('关注领域列表'),
  badges: z.array(z.string()).describe('标签列表'),
});

/** Agent 角色配置 — 存储在 DB 中，运行时动态加载 */
export const AgentConfigSchema = z.object({
  id: z.string().describe('唯一标识符'),
  name: z.string().describe('角色名称，如 技术信号分析员'),
  description: z.string().describe('角色描述'),
  instructions: z.string().describe('Agent system prompt'),
  model: z.string().default('deepseek/deepseek-chat'),
  toolIds: z.array(z.string()).describe('绑定的工具 ID 列表'),
  memoryEnabled: z.boolean().default(true),
  metadata: AgentMetadataSchema.optional(),
  isTemplate: z.boolean().default(false),
  createdAt: z.string(),
  updatedAt: z.string(),
});

/** Agent 模板 — 用于创建新 Agent 的预设 */
export const AgentTemplateSchema = z.object({
  id: z.string().describe('模板 ID'),
  name: z.string().describe('模板名称'),
  description: z.string().describe('模板描述'),
  instructions: z.string().describe('预设 instructions'),
  model: z.string().default('deepseek/deepseek-chat'),
  toolIds: z.array(z.string()).describe('预设工具 ID 列表'),
  metadata: AgentMetadataSchema.optional(),
  category: z.string().describe('模板分类，如 技术分析、基本面、宏观'),
});

// ─── 协作模式 Schemas ───────────────────────────────────────────────

/** 协作模式 */
export const CollaborationPatternSchema = z.enum([
  'council',       // 圆桌会议：N 个 agent 并行分析，Supervisor 汇总
  'pipeline',      // 流水线：N 个 agent 串行，上游输出是下游输入
  'debate',        // 辩论：多空两方对抗，Supervisor 裁决
  'hierarchical',  // 层级委派：Supervisor 动态拆解任务
  'parallel-scan', // 并行扫描：N 个 agent 分别扫描不同标的
]);

/** 投研工作流配置 */
export const ResearchWorkflowConfigSchema = z.object({
  id: z.string(),
  name: z.string().describe('工作流名称'),
  pattern: CollaborationPatternSchema,
  participantAgentIds: z.array(z.string()).describe('参与的 agent ID 列表'),
  supervisorAgentId: z.string().optional().describe('汇总/裁决 agent ID'),
  symbols: z.array(z.string()).optional().describe('分析标的列表（parallel-scan 模式使用）'),
  createdAt: z.string(),
  updatedAt: z.string(),
});

// ─── TypeScript Types ────────────────────────────────────────────────
export type KLineData = z.infer<typeof KLineDataSchema>;
export type Indicators = z.infer<typeof IndicatorsSchema>;
export type TradeSignal = z.infer<typeof TradeSignalSchema>;
export type Position = z.infer<typeof PositionSchema>;
export type AgentOpinion = z.infer<typeof AgentOpinionSchema>;
export type RiskItem = z.infer<typeof RiskItemSchema>;
export type TrackingCondition = z.infer<typeof TrackingConditionSchema>;
export type ResearchReport = z.infer<typeof ResearchReportSchema>;
export type NewsArticle = z.infer<typeof NewsArticleSchema>;
export type NewsSentimentResult = z.infer<typeof NewsSentimentResultSchema>;
export type Fundamentals = z.infer<typeof FundamentalsSchema>;
export type AgentMetadata = z.infer<typeof AgentMetadataSchema>;
export type AgentConfig = z.infer<typeof AgentConfigSchema>;
export type AgentTemplate = z.infer<typeof AgentTemplateSchema>;
export type CollaborationPattern = z.infer<typeof CollaborationPatternSchema>;
export type ResearchWorkflowConfig = z.infer<typeof ResearchWorkflowConfigSchema>;
