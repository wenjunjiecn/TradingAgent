import { createStep, createWorkflow } from '@mastra/core/workflows';
import { z } from 'zod';
import {
  KLineDataSchema,
  IndicatorsSchema,
  TradeSignalSchema,
  ResearchReportSchema,
  type KLineData,
  type Indicators,
  type TradeSignal,
  type ResearchReport,
} from '@trading-agent/shared';
import { getMarketData } from '../tools/market-data-tool';
import { calculateIndicators } from '../tools/technical-analysis-tool';
import { executeCollaboration } from './collaboration-engine';

type SignalType = 'BUY' | 'SELL' | 'HOLD' | 'WATCH';

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

// ── Step 1: 获取行情 K 线数据 + 计算指标 ──────────────────────────────
const fetchMarketData = createStep({
  id: 'fetch-market-data',
  description: 'Fetch historical K-line data and compute technical indicators',
  inputSchema: z.object({
    symbol: z.string().describe('US stock ticker, e.g. AAPL'),
    pattern: z.enum(['council', 'pipeline', 'debate', 'hierarchical', 'parallel-scan']).optional(),
    participantAgentIds: z.array(z.string()).optional(),
    supervisorAgentId: z.string().optional(),
  }),
  outputSchema: z.object({
    symbol: z.string(),
    latestPrice: z.number(),
    klines: z.array(KLineDataSchema),
    indicators: IndicatorsSchema,
    pattern: z.enum(['council', 'pipeline', 'debate', 'hierarchical', 'parallel-scan']).optional(),
    participantAgentIds: z.array(z.string()).optional(),
    supervisorAgentId: z.string().optional(),
  }),
  execute: async ({ inputData }) => {
    if (!inputData?.symbol) throw new Error('Symbol is required');
    const result = await getMarketData(inputData.symbol, '3mo');
    const indicators = calculateIndicators(result.klines as KLineData[]);
    return {
      symbol: result.symbol,
      latestPrice: result.latestPrice,
      klines: result.klines,
      indicators,
      pattern: inputData.pattern,
      participantAgentIds: inputData.participantAgentIds,
      supervisorAgentId: inputData.supervisorAgentId,
    };
  },
});

// ── Step 2: 协作分析 — 通过协作引擎执行多角色 Agent 分析 ──────────────────
const collaborationAnalysis = createStep({
  id: 'collaboration-analysis',
  description: 'Execute collaboration pattern (council/pipeline/debate/hierarchical) to produce a research report',
  inputSchema: z.object({
    symbol: z.string(),
    latestPrice: z.number(),
    klines: z.array(KLineDataSchema),
    indicators: IndicatorsSchema,
    pattern: z.enum(['council', 'pipeline', 'debate', 'hierarchical', 'parallel-scan']).optional(),
    participantAgentIds: z.array(z.string()).optional(),
    supervisorAgentId: z.string().optional(),
  }),
  outputSchema: z.object({
    report: ResearchReportSchema,
    summary: z.string(),
  }),
  execute: async ({ inputData, mastra }) => {
    if (!inputData) throw new Error('Input data missing');
    const { symbol, latestPrice, klines, indicators, pattern } = inputData;

    // 默认参与 agent 和 supervisor
    const participantAgentIds = inputData.participantAgentIds ?? [
      'trading-agent',
      'market-analysis-agent',
      'sentiment-analysis-agent',
      'risk-analysis-agent',
    ];
    const supervisorAgentId = inputData.supervisorAgentId ?? 'research-supervisor';

    const report = await executeCollaboration(mastra as any, {
      symbol,
      pattern: pattern ?? 'council',
      participantAgentIds,
      supervisorAgentId,
      marketData: {
        latestPrice,
        klines: klines as KLineData[],
        indicators: indicators as Indicators,
      },
    }) as ResearchReport;

    return {
      report,
      summary: `${symbol} 投研完成（${pattern} 模式）：${report.action} @ $${latestPrice.toFixed(2)}（信心度 ${report.confidence}）。${report.conclusion.slice(0, 100)}...`,
    };
  },
});

// ── Workflow 组装 ─────────────────────────────────────────────────────
// 取数 → 协作分析（默认 Council 模式，可通过 input 指定其他模式）
const tradingWorkflow = createWorkflow({
  id: 'trading-workflow',
  inputSchema: z.object({
    symbol: z.string().describe('US stock ticker symbol, e.g. AAPL'),
    pattern: z.enum(['council', 'pipeline', 'debate', 'hierarchical', 'parallel-scan']).optional().describe('Collaboration pattern (default: council)'),
    participantAgentIds: z.array(z.string()).optional().describe('Participant agent IDs (default: 4 core agents)'),
    supervisorAgentId: z.string().optional().describe('Supervisor agent ID (default: research-supervisor)'),
  }),
  outputSchema: z.object({
    report: ResearchReportSchema,
    summary: z.string(),
  }),
})
  .then(fetchMarketData)
  .then(collaborationAnalysis);

tradingWorkflow.commit();
export { tradingWorkflow };
