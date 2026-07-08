import { z } from 'zod';

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
  subAgentIds: z.array(z.string()).optional().describe('子 Agent ID 列表（supervisor 模式：运行时注入子 agent 引用）'),
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
  subAgentIds: z.array(z.string()).optional().describe('子 Agent ID 列表（supervisor 模式）'),
});

// ─── TypeScript Types ────────────────────────────────────────────────
export type AgentMetadata = z.infer<typeof AgentMetadataSchema>;
export type AgentConfig = z.infer<typeof AgentConfigSchema>;
export type AgentTemplate = z.infer<typeof AgentTemplateSchema>;
