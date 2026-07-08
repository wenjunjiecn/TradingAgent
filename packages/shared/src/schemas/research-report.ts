import { z } from 'zod';
import { TradeSignalSchema } from './market-data.js';

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
  workflowConfigId: z.string().optional().describe('产生此报告的工作流配置 ID（已废弃，使用 teamId）'),
  teamId: z.string().optional().describe('产出此报告的 Agent Team ID'),
});

// ─── TypeScript Types ────────────────────────────────────────────────
export type AgentOpinion = z.infer<typeof AgentOpinionSchema>;
export type RiskItem = z.infer<typeof RiskItemSchema>;
export type TrackingCondition = z.infer<typeof TrackingConditionSchema>;
export type ResearchReport = z.infer<typeof ResearchReportSchema>;
