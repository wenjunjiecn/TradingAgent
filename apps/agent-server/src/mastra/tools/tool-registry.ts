import { marketDataTool } from './market-data-tool';
import { technicalAnalysisTool } from './technical-analysis-tool';
import { newsSentimentTool } from './news-sentiment-tool';
import { fundamentalsTool } from './fundamentals-tool';

/**
 * 工具注册中心
 *
 * 维护所有可用工具的映射，供 Agent 配置化时按 ID 引用工具。
 * 新增工具时在此注册即可。
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

/** 根据 ID 列表获取工具对象映射 */
export function getToolsByIds(ids: string[]): Record<string, any> {
  const tools: Record<string, any> = {};
  for (const id of ids) {
    const tool = (toolRegistry as Record<string, any>)[id];
    if (tool) {
      tools[id] = tool;
    }
  }
  return tools;
}
