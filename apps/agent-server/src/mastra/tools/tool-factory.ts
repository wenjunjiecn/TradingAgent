import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import type { ToolConfig, HttpToolConfig, McpToolConfig, CodeToolConfig } from '@trading-agent/shared';
import { toolRegistry } from './tool-registry';
import { jsonSchemaToZod } from './json-schema-converter';
import { executeHttpRequest } from './http-tool-executor';
import { executeMcpCall } from './mcp-tool-executor';
import { executeCode } from './code-tool-executor';

/**
 * 工具工厂
 *
 * 根据 ToolConfig 的 type 字段动态创建 Mastra 工具实例。
 * 这是连接 DB 配置和运行时执行的核心桥梁。
 *
 * type=builtin → 从 toolRegistry 取已有实现
 * type=http    → 根据 config 动态构建 fetch 请求
 * type=mcp     → 通过 MCP 协议调用远程工具
 * type=code    → 执行用户编写的 JavaScript 代码
 */

/**
 * 根据 ToolConfig 动态创建 Mastra 工具实例
 *
 * @returns Record<string, tool> 或 null (创建失败)
 */
export async function createToolFromConfig(
  config: ToolConfig,
): Promise<Record<string, any> | null> {
  if (!config.enabled) return null;

  switch (config.type) {
    case 'builtin':
      return createBuiltinTool(config);
    case 'http':
      return createHttpTool(config);
    case 'mcp':
      return createMcpTool(config);
    case 'code':
      return createCodeTool(config);
    default:
      console.warn(`[ToolFactory] Unknown tool type: ${(config as any).type}`);
      return null;
  }
}

/** 内置工具: 从 toolRegistry 取已有实现 */
function createBuiltinTool(config: ToolConfig): Record<string, any> | null {
  const tool = (toolRegistry as Record<string, any>)[config.id];
  if (!tool) {
    console.warn(`[ToolFactory] Builtin tool not found in registry: ${config.id}`);
    return null;
  }
  return { [config.id]: tool };
}

/** HTTP 工具: 动态构建 fetch 请求 */
function createHttpTool(config: ToolConfig): Record<string, any> {
  const httpConfig = (config.config ?? {}) as HttpToolConfig;
  const inputZod = config.inputSchema
    ? jsonSchemaToZod(config.inputSchema)
    : z.object({}).passthrough();

  const tool = createTool({
    id: config.id,
    description: config.description,
    inputSchema: inputZod,
    outputSchema: config.outputSchema
      ? jsonSchemaToZod(config.outputSchema)
      : z.any().optional(),
    execute: async (input: Record<string, any>) => {
      return executeHttpRequest(httpConfig, input);
    },
  });

  return { [config.id]: tool };
}

/** MCP 工具: 通过 MCP 协议调用远程工具 */
function createMcpTool(config: ToolConfig): Record<string, any> {
  const mcpConfig = (config.config ?? {}) as McpToolConfig;
  const inputZod = config.inputSchema
    ? jsonSchemaToZod(config.inputSchema)
    : z.object({}).passthrough();

  const tool = createTool({
    id: config.id,
    description: config.description,
    inputSchema: inputZod,
    outputSchema: z.any().optional(),
    execute: async (input: Record<string, any>) => {
      return executeMcpCall(mcpConfig, input);
    },
  });

  return { [config.id]: tool };
}

/** Code 工具: 执行用户编写的 JavaScript 代码 */
function createCodeTool(config: ToolConfig): Record<string, any> {
  const codeConfig = (config.config ?? {}) as CodeToolConfig;
  const inputZod = config.inputSchema
    ? jsonSchemaToZod(config.inputSchema)
    : z.object({}).passthrough();

  const tool = createTool({
    id: config.id,
    description: config.description,
    inputSchema: inputZod,
    outputSchema: config.outputSchema
      ? jsonSchemaToZod(config.outputSchema)
      : z.any().optional(),
    execute: async (input: Record<string, any>) => {
      return executeCode(codeConfig, input);
    },
  });

  return { [config.id]: tool };
}

/**
 * 直接执行工具 (用于测试端点)
 *
 * 不创建 Mastra Tool 实例，直接调用 execute 逻辑。
 */
export async function executeToolDirect(
  config: ToolConfig,
  input: Record<string, any>,
): Promise<any> {
  switch (config.type) {
    case 'builtin': {
      const tool = (toolRegistry as Record<string, any>)[config.id];
      if (!tool) throw new Error(`Builtin tool not found: ${config.id}`);
      if (typeof tool.execute === 'function') {
        return tool.execute({ context: input } as any);
      }
      throw new Error(`Builtin tool has no execute function: ${config.id}`);
    }
    case 'http': {
      const httpConfig = (config.config ?? {}) as HttpToolConfig;
      return executeHttpRequest(httpConfig, input);
    }
    case 'mcp': {
      const mcpConfig = (config.config ?? {}) as McpToolConfig;
      return executeMcpCall(mcpConfig, input);
    }
    case 'code': {
      const codeConfig = (config.config ?? {}) as CodeToolConfig;
      return executeCode(codeConfig, input);
    }
    default:
      throw new Error(`Unknown tool type: ${(config as any).type}`);
  }
}
