import { createStep, createWorkflow } from '@mastra/core/workflows';
import { z } from 'zod';
import {
  KLineDataSchema,
  IndicatorsSchema,
  TradeSignalSchema,
  type KLineData,
  type Indicators,
} from '@trading-agent/shared';
import { marketDataTool } from '../tools/market-data-tool';
import { technicalAnalysisTool } from '../tools/technical-analysis-tool';

// ── Step 1: 获取行情 K 线数据 ──────────────────────────────────────────
const fetchMarketData = createStep({
  id: 'fetch-market-data',
  description: 'Fetch historical K-line data from Yahoo Finance',
  inputSchema: z.object({
    symbol: z.string().describe('US stock ticker, e.g. AAPL'),
  }),
  outputSchema: z.object({
    symbol: z.string(),
    latestPrice: z.number(),
    klines: z.array(KLineDataSchema),
  }),
  execute: async ({ inputData }) => {
    if (!inputData?.symbol) throw new Error('Symbol is required');
    const result = await marketDataTool.execute({ symbol: inputData.symbol, period: '3mo' });
    return { symbol: result.symbol, latestPrice: result.latestPrice, klines: result.klines };
  },
});

// ── Step 2: 计算技术指标 ────────────────────────────────────────────────
const computeIndicators = createStep({
  id: 'compute-indicators',
  description: 'Calculate MA20, MA60, RSI, MACD from K-line data',
  inputSchema: z.object({
    symbol: z.string(),
    latestPrice: z.number(),
    klines: z.array(KLineDataSchema),
  }),
  outputSchema: z.object({
    symbol: z.string(),
    latestPrice: z.number(),
    indicators: IndicatorsSchema,
  }),
  execute: async ({ inputData }) => {
    if (!inputData) throw new Error('Input data missing');
    const indicators = await technicalAnalysisTool.execute({ klines: inputData.klines as KLineData[] });
    return {
      symbol: inputData.symbol,
      latestPrice: inputData.latestPrice,
      indicators: indicators as Indicators,
    };
  },
});

// ── Step 3: Agent 综合分析，生成交易信号 ──────────────────────────────────
const generateSignal = createStep({
  id: 'generate-signal',
  description: 'Use Trading Agent to produce BUY/SELL/HOLD signal with reasoning',
  inputSchema: z.object({
    symbol: z.string(),
    latestPrice: z.number(),
    indicators: IndicatorsSchema,
  }),
  outputSchema: z.object({
    signal: TradeSignalSchema,
    summary: z.string(),
  }),
  execute: async ({ inputData, mastra }) => {
    if (!inputData) throw new Error('Input data missing');
    const agent = mastra?.getAgent('tradingAgent');
    if (!agent) throw new Error('tradingAgent not found in Mastra instance');

    const { symbol, latestPrice, indicators } = inputData;
    const prompt = `请对 ${symbol} 进行技术分析并给出交易信号。

当前数据：
- 最新收盘价：$${latestPrice.toFixed(2)}
- MA20：${indicators.ma20.toFixed(2)}
- MA60：${indicators.ma60.toFixed(2)}
- RSI(14)：${indicators.rsi.toFixed(2)}
- MACD：${indicators.macd.toFixed(4)}
- MACD Signal：${indicators.macdSignal.toFixed(4)}
- MACD Histogram：${indicators.macdHistogram.toFixed(4)}
- 当前时间戳：${Date.now()}

请按照你的分析规则，输出 JSON 格式的交易信号（包裹在 \`\`\`json 代码块中）。`;

    const response = await agent.stream([{ role: 'user', content: prompt }]);
    let text = '';
    for await (const chunk of response.textStream) { text += chunk; }

    const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/) || text.match(/(\{[\s\S]*"action"[\s\S]*\})/);
    if (!jsonMatch?.[1]) {
      throw new Error(`Agent did not return valid JSON. Response: ${text.slice(0, 300)}`);
    }

    const signal = TradeSignalSchema.parse(JSON.parse(jsonMatch[1]));
    return {
      signal,
      summary: `${symbol} 分析完成：${signal.action} @ $${signal.price.toFixed(2)}。${signal.reason}`,
    };
  },
});

// ── Workflow 组装 ───────────────────────────────────────────────────────
const tradingWorkflow = createWorkflow({
  id: 'trading-workflow',
  inputSchema: z.object({
    symbol: z.string().describe('US stock ticker symbol, e.g. AAPL'),
  }),
  outputSchema: z.object({
    signal: TradeSignalSchema,
    summary: z.string(),
  }),
})
  .then(fetchMarketData)
  .then(computeIndicators)
  .then(generateSignal);

tradingWorkflow.commit();
export { tradingWorkflow };
