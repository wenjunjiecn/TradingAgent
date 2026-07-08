import { z } from 'zod';
import { AgentOpinionSchema, RiskItemSchema, TrackingConditionSchema } from './research-report.js';

// ─── 协作模式 Schemas ───────────────────────────────────────────────

/** 协作模式 */
export const CollaborationPatternSchema = z.enum([
  'council',       // 圆桌会议：N 个 agent 并行分析，Supervisor 汇总
  'pipeline',      // 流水线：N 个 agent 串行，上游输出是下游输入
  'debate',        // 辩论：多空两方对抗，Supervisor 裁决
  'hierarchical',  // 层级委派：Supervisor 动态拆解任务
  'parallel-scan', // 并行扫描：N 个 agent 分别扫描不同标的
]);

/** @deprecated 被 AgentTeamConfigSchema 替代 */
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

/** 协作模式配置（每种模式的定制参数） */
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

// ─── 通用任务执行 ────────────────────────────────────────────────────

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

/** Agent Team 模板 */
export const AgentTeamTemplateSchema = z.object({
  id: z.string().describe('模板 ID'),
  name: z.string().describe('模板名称'),
  description: z.string().describe('模板描述'),
  members: z.array(TeamMemberSchema),
  supervisorAgentId: z.string().optional(),
  collaboration: TeamCollaborationConfigSchema,
  teamInstructions: z.string().optional(),
  sharedContext: z.string().optional(),
  outputFormat: z.enum(['research-report', 'summary', 'custom']).default('research-report'),
  sharedMemoryEnabled: z.boolean().default(false),
  defaultTarget: z.string().optional(),
  tags: z.array(z.string()).default([]),
  category: z.string().describe('模板分类'),
});

// ─── TypeScript Types ────────────────────────────────────────────────
export type CollaborationPattern = z.infer<typeof CollaborationPatternSchema>;
export type ResearchWorkflowConfig = z.infer<typeof ResearchWorkflowConfigSchema>;
export type TeamMemberRole = z.infer<typeof TeamMemberRoleSchema>;
export type TeamMember = z.infer<typeof TeamMemberSchema>;
export type TeamCollaborationConfig = z.infer<typeof TeamCollaborationConfigSchema>;
export type AgentTeamConfig = z.infer<typeof AgentTeamConfigSchema>;
export type TeamExecutionInput = z.infer<typeof TeamExecutionInputSchema>;
export type TeamExecutionResult = z.infer<typeof TeamExecutionResultSchema>;
export type AgentTeamTemplate = z.infer<typeof AgentTeamTemplateSchema>;
