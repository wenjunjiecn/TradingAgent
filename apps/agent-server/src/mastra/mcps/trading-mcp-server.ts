import { MCPServer } from '@mastra/mcp';
import { marketDataTool } from '../tools/market-data-tool';
import { technicalAnalysisTool } from '../tools/technical-analysis-tool';
import { newsSentimentTool } from '../tools/news-sentiment-tool';
import { fundamentalsTool } from '../tools/fundamentals-tool';

export const tradingMcpServer = new MCPServer({
  id: 'trading-mcp-server',
  name: 'Trading MCP Server',
  version: '2.0.0',
  description: 'Trading research tools: market data, technical analysis, news sentiment, and fundamentals.',
  tools: {
    marketDataTool,
    technicalAnalysisTool,
    newsSentimentTool,
    fundamentalsTool,
  },
});
