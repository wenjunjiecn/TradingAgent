import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { KLineDataSchema, IndicatorsSchema, type KLineData } from '@trading-agent/shared';

/** Simple Moving Average over last `period` closes */
function sma(closes: number[], period: number): number {
  if (closes.length < period) return closes[closes.length - 1] ?? 0;
  const slice = closes.slice(-period);
  return slice.reduce((sum, v) => sum + v, 0) / period;
}

/** Exponential Moving Average — EMA(t) = price*k + EMA(t-1)*(1-k), k=2/(n+1) */
function ema(closes: number[], period: number): number[] {
  const k = 2 / (period + 1);
  const result: number[] = [];
  let prev = closes[0] ?? 0;
  for (const price of closes) {
    const cur = price * k + prev * (1 - k);
    result.push(cur);
    prev = cur;
  }
  return result;
}

/** RSI(14): 100 - 100/(1 + RS), RS = avg_gain / avg_loss */
function rsi(closes: number[], period = 14): number {
  if (closes.length < period + 1) return 50;
  const changes = closes.slice(1).map((v, i) => v - (closes[i] ?? 0));
  const recent = changes.slice(-period);
  const gains = recent.filter(c => c > 0);
  const losses = recent.filter(c => c < 0).map(Math.abs);
  const avgGain = gains.reduce((s, v) => s + v, 0) / period;
  const avgLoss = losses.reduce((s, v) => s + v, 0) / period;
  if (avgLoss === 0) return 100;
  return 100 - 100 / (1 + avgGain / avgLoss);
}

/** MACD = EMA(12) - EMA(26); Signal = EMA(9) of MACD line */
function macdCalc(closes: number[]): { macd: number; signal: number; histogram: number } {
  const ema12 = ema(closes, 12);
  const ema26 = ema(closes, 26);
  const macdLine = ema12.map((v, i) => v - (ema26[i] ?? 0));
  const signalLine = ema(macdLine, 9);
  const last = macdLine.length - 1;
  const macdVal = macdLine[last] ?? 0;
  const signalVal = signalLine[last] ?? 0;
  return { macd: macdVal, signal: signalVal, histogram: macdVal - signalVal };
}

export const technicalAnalysisTool = createTool({
  id: 'technical-analysis',
  description: 'Calculate technical indicators (MA20, MA60, RSI14, MACD) from K-line data. Requires at least 20 bars.',
  inputSchema: z.object({
    klines: z.array(KLineDataSchema).min(20).describe('K-line bars in chronological order (oldest first)'),
  }),
  outputSchema: IndicatorsSchema,
  execute: async ({ klines }: { klines: KLineData[] }) => {
    const closes = klines.map(k => k.close);
    const { macd, signal, histogram } = macdCalc(closes);
    return {
      ma20: sma(closes, 20),
      ma60: sma(closes, Math.min(60, closes.length)),
      rsi: rsi(closes),
      macd,
      macdSignal: signal,
      macdHistogram: histogram,
    };
  },
});
