import { createStep, createWorkflow } from '@mastra/core/workflows';
import { z } from 'zod';
import {
  KLineDataSchema,
  IndicatorsSchema,
  TradeSignalSchema,
  type KLineData,
  type Indicators,
  type TradeSignal,
} from '@trading-agent/shared';
import { getMarketData } from '../tools/market-data-tool';
import { calculateIndicators } from '../tools/technical-analysis-tool';

function round(value: number, digits: number): number {
  return Number(value.toFixed(digits));
}

function normalizeIndicators(indicators: Indicators): Indicators {
  return {
    ma20: round(indicators.ma20, 2),
    ma60: round(indicators.ma60, 2),
    rsi: round(indicators.rsi, 2),
    macd: round(indicators.macd, 4),
    macdSignal: round(indicators.macdSignal, 4),
    macdHistogram: round(indicators.macdHistogram, 4),
  };
}

function deriveSignal(symbol: string, latestPrice: number, indicators: Indicators): TradeSignal {
  const normalized = normalizeIndicators(indicators);
  let action: TradeSignal['action'] = 'HOLD';
  let reason = `当前 RSI=${normalized.rsi}，MA20=${normalized.ma20}，MA60=${normalized.ma60}，MACD 柱=${normalized.macdHistogram}，趋势信号不够一致，暂时维持观望。`;

  if (normalized.rsi < 30 && normalized.macdHistogram > 0) {
    action = 'BUY';
    reason = `RSI=${normalized.rsi} 处于超卖区域，且 MACD 柱=${normalized.macdHistogram} 转为正值，多头动能改善，判断为买入信号。`;
  } else if (normalized.rsi > 70 && normalized.macdHistogram < 0) {
    action = 'SELL';
    reason = `RSI=${normalized.rsi} 处于超买区域，且 MACD 柱=${normalized.macdHistogram} 转为负值，动能走弱，判断为卖出信号。`;
  } else if (normalized.ma20 > normalized.ma60 && normalized.rsi >= 40 && normalized.rsi <= 60) {
    action = 'BUY';
    reason = `MA20=${normalized.ma20} 高于 MA60=${normalized.ma60}，中期趋势偏多，RSI=${normalized.rsi} 未过热，判断为买入信号。`;
  } else if (normalized.ma20 < normalized.ma60 && normalized.rsi >= 40 && normalized.rsi <= 60) {
    action = 'SELL';
    reason = `MA20=${normalized.ma20} 低于 MA60=${normalized.ma60}，中期趋势偏弱，RSI=${normalized.rsi} 未明显超卖，判断为卖出信号。`;
  }

  return TradeSignalSchema.parse({
    symbol,
    action,
    price: round(latestPrice, 2),
    timestamp: Date.now(),
    reason,
    indicators: normalized,
  });
}

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
    const result = await getMarketData(inputData.symbol, '3mo');
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
    const indicators = calculateIndicators(inputData.klines as KLineData[]);
    return {
      symbol: inputData.symbol,
      latestPrice: inputData.latestPrice,
      indicators,
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
  execute: async ({ inputData }) => {
    if (!inputData) throw new Error('Input data missing');
    const { symbol, latestPrice, indicators } = inputData;
    const signal = deriveSignal(symbol, latestPrice, indicators);
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
