import { z } from 'zod';

// ─── Zod Schemas ────────────────────────────────────────────────────
export const KLineDataSchema = z.object({
  time: z.number().describe('Unix timestamp (seconds)'),
  open: z.number(),
  high: z.number(),
  low: z.number(),
  close: z.number(),
  volume: z.number(),
});

export const IndicatorsSchema = z.object({
  ma20: z.number().describe('20-period Simple Moving Average'),
  ma60: z.number().describe('60-period Simple Moving Average'),
  rsi: z.number().describe('14-period RSI (0-100)'),
  macd: z.number().describe('MACD line (EMA12 - EMA26)'),
  macdSignal: z.number().describe('MACD signal line (EMA9 of MACD)'),
  macdHistogram: z.number().describe('MACD histogram (MACD - Signal)'),
});

export const TradeSignalSchema = z.object({
  symbol: z.string().describe('Stock ticker symbol, e.g. AAPL'),
  action: z.enum(['BUY', 'SELL', 'HOLD']),
  price: z.number().describe('Current price at signal generation'),
  timestamp: z.number().describe('Unix timestamp (ms)'),
  reason: z.string().describe('Human-readable analysis explanation in Chinese'),
  indicators: IndicatorsSchema,
});

export const PositionSchema = z.object({
  symbol: z.string(),
  shares: z.number(),
  entryPrice: z.number(),
  currentPrice: z.number(),
  unrealizedPnl: z.number(),
  unrealizedPnlPct: z.number(),
});

// ─── TypeScript Types ────────────────────────────────────────────────
export type KLineData = z.infer<typeof KLineDataSchema>;
export type Indicators = z.infer<typeof IndicatorsSchema>;
export type TradeSignal = z.infer<typeof TradeSignalSchema>;
export type Position = z.infer<typeof PositionSchema>;
