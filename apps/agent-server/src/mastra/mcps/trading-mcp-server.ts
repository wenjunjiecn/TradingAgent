import { MCPServer } from '@mastra/mcp';
import { marketDataTool } from '../tools/market-data-tool';
import { technicalAnalysisTool } from '../tools/technical-analysis-tool';

export const tradingMcpServer = new MCPServer({
  id: 'trading-mcp-server',
  name: 'Trading MCP Server',
  version: '1.0.0',
  description: 'Trading analysis tools for market data retrieval and technical indicator calculation.',
  tools: {
    marketDataTool,
    technicalAnalysisTool,
  },
});
