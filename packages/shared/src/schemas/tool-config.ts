import { z } from 'zod';

// ─── Tool 配置 Schemas ──────────────────────────────────────────────

/** 工具分类 */
export const ToolCategorySchema = z.enum([
  'market-data',
  'technical-analysis',
  'news-sentiment',
  'fundamentals',
  'custom',
]).describe('工具分类');

/** 工具配置 — 存储在 DB 中，管理工具的元数据与启用状态 */
export const ToolConfigSchema = z.object({
  id: z.string().describe('唯一标识符'),
  name: z.string().describe('工具名称'),
  description: z.string().describe('工具描述'),
  category: ToolCategorySchema.default('custom'),
  enabled: z.boolean().default(true).describe('是否启用'),
  isBuiltin: z.boolean().default(false).describe('是否为内置工具（内置工具不可删除）'),
  inputSchema: z.string().optional().describe('输入参数 JSON Schema（字符串形式）'),
  outputSchema: z.string().optional().describe('输出参数 JSON Schema（字符串形式）'),
  config: z.record(z.any()).optional().describe('额外配置项（键值对）'),
  createdAt: z.string(),
  updatedAt: z.string(),
});

/** 创建工具配置时的输入（不含自动生成的字段） */
export const CreateToolConfigInputSchema = ToolConfigSchema.omit({
  createdAt: true,
  updatedAt: true,
  isBuiltin: true,
});

// ─── TypeScript Types ────────────────────────────────────────────────

export type ToolCategory = z.infer<typeof ToolCategorySchema>;
export type ToolConfig = z.infer<typeof ToolConfigSchema>;
export type CreateToolConfigInput = z.infer<typeof CreateToolConfigInputSchema>;
