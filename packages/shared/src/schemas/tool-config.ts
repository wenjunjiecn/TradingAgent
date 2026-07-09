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

/** 工具执行类型 */
export const ToolTypeSchema = z.enum([
  'builtin',
  'http',
  'mcp',
  'code',
]).describe('工具执行类型');

/** HTTP 工具配置 */
export const HttpToolConfigSchema = z.object({
  url: z.string().describe('请求地址'),
  method: z.enum(['GET', 'POST', 'PUT', 'DELETE', 'PATCH']).default('GET'),
  headers: z.record(z.string()).optional().describe('请求头'),
  /** 路径参数映射: { "symbol": "{{input.symbol}}" } */
  pathParams: z.record(z.string()).optional(),
  /** 查询参数映射 */
  queryParams: z.record(z.string()).optional(),
  /** 请求体模板 (JSON 字符串, 支持 {{input.xxx}} 插值) */
  bodyTemplate: z.string().optional(),
  /** 超时毫秒 */
  timeoutMs: z.number().default(12000),
  /** 响应提取路径 (如 "data.result") */
  responsePath: z.string().optional(),
});

/** MCP 工具配置 */
export const McpToolConfigSchema = z.object({
  serverUrl: z.string().describe('MCP Server URL'),
  serverName: z.string().describe('MCP Server 名称'),
  remoteToolName: z.string().describe('远程工具名称'),
  /** MCP 认证 token (可选) */
  authToken: z.string().optional(),
});

/** Code 工具配置 */
export const CodeToolConfigSchema = z.object({
  /** JavaScript/TypeScript 代码，async function 形式 */
  code: z.string().describe('异步函数代码, 接收 input 参数, return 返回结果'),
  /** 运行超时毫秒 */
  timeoutMs: z.number().default(15000),
  /** 可选的环境变量注入 */
  env: z.record(z.string()).optional(),
});

/** 工具配置 — 存储在 DB 中，管理工具的元数据、执行类型与启用状态 */
export const ToolConfigSchema = z.object({
  id: z.string().describe('唯一标识符'),
  name: z.string().describe('工具名称'),
  description: z.string().describe('工具描述'),
  category: ToolCategorySchema.default('custom'),
  type: ToolTypeSchema.default('builtin').describe('工具执行类型'),
  enabled: z.boolean().default(true).describe('是否启用'),
  isBuiltin: z.boolean().default(false).describe('是否为内置工具（内置工具不可删除）'),
  /** 输入参数 JSON Schema (对象形式, https://json-schema.org) */
  inputSchema: z.record(z.any()).optional().describe('输入参数 JSON Schema'),
  /** 输出参数 JSON Schema */
  outputSchema: z.record(z.any()).optional().describe('输出参数 JSON Schema'),
  /** 执行配置 — 根据 type 不同结构不同 (HttpToolConfig / McpToolConfig / CodeToolConfig) */
  config: z.record(z.any()).optional().describe('执行配置, 根据 type 不同结构不同'),
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
export type ToolType = z.infer<typeof ToolTypeSchema>;
export type ToolConfig = z.infer<typeof ToolConfigSchema>;
export type CreateToolConfigInput = z.infer<typeof CreateToolConfigInputSchema>;
export type HttpToolConfig = z.infer<typeof HttpToolConfigSchema>;
export type McpToolConfig = z.infer<typeof McpToolConfigSchema>;
export type CodeToolConfig = z.infer<typeof CodeToolConfigSchema>;
