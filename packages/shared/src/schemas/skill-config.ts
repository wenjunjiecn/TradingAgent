import { z } from 'zod';

// ─── Skill 配置 Schemas ─────────────────────────────────────────────

/** 技能分类 */
export const SkillCategorySchema = z.enum([
  'research',
  'analysis',
  'trading',
  'risk-management',
  'custom',
]).describe('技能分类');

/** 技能配置 — 存储在 DB 中，管理技能的元数据与启用状态 */
export const SkillConfigSchema = z.object({
  id: z.string().describe('唯一标识符'),
  name: z.string().describe('技能名称'),
  description: z.string().describe('技能描述'),
  category: SkillCategorySchema.default('custom'),
  enabled: z.boolean().default(true).describe('是否启用'),
  isBuiltin: z.boolean().default(false).describe('是否为内置技能（内置技能不可删除）'),
  content: z.string().default('').describe('技能的提示词/指令内容'),
  triggers: z.array(z.string()).default([]).describe('触发关键词列表'),
  config: z.record(z.any()).optional().describe('额外配置项（键值对）'),
  createdAt: z.string(),
  updatedAt: z.string(),
});

/** 创建技能配置时的输入（不含自动生成的字段） */
export const CreateSkillConfigInputSchema = SkillConfigSchema.omit({
  createdAt: true,
  updatedAt: true,
  isBuiltin: true,
});

// ─── TypeScript Types ────────────────────────────────────────────────

export type SkillCategory = z.infer<typeof SkillCategorySchema>;
export type SkillConfig = z.infer<typeof SkillConfigSchema>;
export type CreateSkillConfigInput = z.infer<typeof CreateSkillConfigInputSchema>;
