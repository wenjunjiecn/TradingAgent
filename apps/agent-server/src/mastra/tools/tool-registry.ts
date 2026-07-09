import { marketDataTool } from './market-data-tool';
import { technicalAnalysisTool } from './technical-analysis-tool';
import { newsSentimentTool } from './news-sentiment-tool';
import { fundamentalsTool } from './fundamentals-tool';
import type { ToolConfig } from '@trading-agent/shared';
import { getToolConfig } from './tool-config-store';
import { createToolFromConfig } from './tool-factory';

/**
 * 工具注册中心
 *
 * 维护所有内置工具的映射。内置工具在此注册，
 * 自定义工具 (http/mcp) 通过 ToolFactory 动态创建。
 */
export const toolRegistry = {
  'get-market-data': marketDataTool,
  'technical-analysis': technicalAnalysisTool,
  'news-sentiment': newsSentimentTool,
  'fundamentals': fundamentalsTool,
} as const;

export type ToolId = keyof typeof toolRegistry;

/** 获取所有已注册工具的 ID 列表 */
export function listToolIds(): string[] {
  return Object.keys(toolRegistry);
}

/**
 * 根据 ID 列表获取工具对象映射 (异步)
 *
 * 优先从 ToolConfig DB 读取配置，通过 ToolFactory 动态创建工具实例。
 * 如果 DB 中找不到配置，回退到 toolRegistry（兼容旧逻辑）。
 *
 * @param ids 工具 ID 列表
 * @returns Record<toolId, toolInstance>
 */
export async function getToolsByIds(
  ids: string[],
): Promise<Record<string, any>> {
  const tools: Record<string, any> = {};

  for (const id of ids) {
    const config: ToolConfig | null = await getToolConfig(id);

    if (config) {
      // 通过 ToolFactory 创建工具
      const toolMap = await createToolFromConfig(config);
      if (toolMap) {
        Object.assign(tools, toolMap);
        continue;
      }
    }

    // 回退: 直接从 toolRegistry 取 (兼容内置工具 DB 尚未种子化的情况)
    const builtinTool = (toolRegistry as Record<string, any>)[id];
    if (builtinTool) {
      tools[id] = builtinTool;
    } else {
      console.warn(`[ToolRegistry] Tool not found: ${id}`);
    }
  }

  return tools;
}
