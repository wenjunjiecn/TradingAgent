import { z } from 'zod';

// ─── 基本面 Schemas ──────────────────────────────────────────────────

/** 基本面数据 */
export const FundamentalsSchema = z.object({
  symbol: z.string(),
  marketCap: z.number().optional().describe('市值（美元）'),
  peRatio: z.number().optional().describe('市盈率 P/E'),
  forwardPE: z.number().optional().describe('远期市盈率'),
  pbRatio: z.number().optional().describe('市净率 P/B'),
  psRatio: z.number().optional().describe('市销率 P/S'),
  pegRatio: z.number().optional().describe('PEG 比率'),
  dividendYield: z.number().optional().describe('股息率（百分比）'),
  beta: z.number().optional().describe('Beta 系数'),
  profitMargin: z.number().optional().describe('利润率（小数，如 0.25 = 25%）'),
  revenueGrowth: z.number().optional().describe('营收增长率（小数）'),
  earningsGrowth: z.number().optional().describe('盈利增长率（小数）'),
  debtToEquity: z.number().optional().describe('资产负债率'),
  returnOnEquity: z.number().optional().describe('ROE（小数）'),
  returnOnAssets: z.number().optional().describe('ROA（小数）'),
  currentRatio: z.number().optional().describe('流动比率'),
  freeCashFlow: z.number().optional().describe('自由现金流（美元）'),
  grossMargin: z.number().optional().describe('毛利率（小数）'),
  operatingMargin: z.number().optional().describe('营业利润率（小数）'),
  sector: z.string().optional().describe('所属行业'),
  industry: z.string().optional().describe('所属子行业'),
});

// ─── TypeScript Types ────────────────────────────────────────────────
export type Fundamentals = z.infer<typeof FundamentalsSchema>;
