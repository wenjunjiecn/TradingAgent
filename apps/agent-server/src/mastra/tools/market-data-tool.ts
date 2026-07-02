import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { KLineDataSchema, type KLineData } from '@trading-agent/shared';

const execFileAsync = promisify(execFile);
const YAHOO_REQUEST_TIMEOUT_MS = 12_000;

const marketDataPeriodSchema = z.enum(['1mo', '3mo', '6mo', '1y']);

export type MarketDataPeriod = z.infer<typeof marketDataPeriodSchema>;

export type MarketDataResult = {
  symbol: string;
  latestPrice: number;
  klines: KLineData[];
  dataPoints: number;
};

const nullableNumberArraySchema = z.array(z.number().finite().nullable());

const YahooChartResponseSchema = z.object({
  chart: z.object({
    result: z.array(z.object({
      meta: z.object({
        regularMarketPrice: z.number().finite().optional(),
        symbol: z.string().optional(),
      }).passthrough(),
      timestamp: z.array(z.number().finite()),
      indicators: z.object({
        quote: z.array(z.object({
          open: nullableNumberArraySchema,
          high: nullableNumberArraySchema,
          low: nullableNumberArraySchema,
          close: nullableNumberArraySchema,
          volume: nullableNumberArraySchema,
        }).passthrough()),
      }).passthrough(),
    }).passthrough()).nullable(),
    error: z.object({
      code: z.string(),
      description: z.string(),
    }).nullable(),
  }).passthrough(),
}).passthrough();

type YahooChartResponse = z.infer<typeof YahooChartResponseSchema>;

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchYahooChartJson(url: string, symbol: string): Promise<YahooChartResponse> {
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    'Accept': 'application/json',
    'Accept-Language': 'en-US,en;q=0.9',
  };

  let fetchFailure: string | undefined;

  try {
    const response = await fetchWithTimeout(url, { headers }, YAHOO_REQUEST_TIMEOUT_MS);
    if (response.ok) {
      const parsed = YahooChartResponseSchema.safeParse(await response.json());
      if (!parsed.success) {
        throw new Error(`Unexpected Yahoo Finance response shape: ${parsed.error.message}`);
      }
      return parsed.data;
    }
    fetchFailure = `HTTP ${response.status}`;
  } catch (error) {
    fetchFailure = error instanceof Error ? error.message : String(error);
  }

  try {
    const { stdout } = await execFileAsync('curl', [
      '-fsSL',
      '--max-time',
      String(Math.ceil(YAHOO_REQUEST_TIMEOUT_MS / 1000)),
      '-H',
      `User-Agent: ${headers['User-Agent']}`,
      '-H',
      `Accept: ${headers.Accept}`,
      '-H',
      `Accept-Language: ${headers['Accept-Language']}`,
      url,
    ], { maxBuffer: 10 * 1024 * 1024 });

    const parsed = YahooChartResponseSchema.safeParse(JSON.parse(stdout));
    if (!parsed.success) {
      throw new Error(`Unexpected Yahoo Finance response shape: ${parsed.error.message}`);
    }
    return parsed.data;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Yahoo Finance API error for ${symbol}: fetch failed (${fetchFailure}); curl fallback failed: ${message}`);
  }
}

async function fetchYahooChart(symbol: string, range: MarketDataPeriod): Promise<KLineData[]> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=1d&includePrePost=false`;
  const data = await fetchYahooChartJson(url, symbol);
  if (data.chart.error) {
    throw new Error(`Yahoo Finance error: ${data.chart.error.description}`);
  }
  const result = data.chart.result?.[0];
  if (!result) throw new Error(`No data found for symbol: ${symbol}`);

  const timestamps = result.timestamp;
  const quote = result.indicators.quote[0];
  if (!quote) {
    throw new Error(`No OHLCV quote data found for symbol: ${symbol}`);
  }

  const klines: KLineData[] = [];
  for (const [i, ts] of timestamps.entries()) {
    const open = quote.open[i];
    const high = quote.high[i];
    const low = quote.low[i];
    const close = quote.close[i];
    const volume = quote.volume[i];

    if (
      typeof open !== 'number' ||
      typeof high !== 'number' ||
      typeof low !== 'number' ||
      typeof close !== 'number' ||
      typeof volume !== 'number'
    ) {
      continue;
    }

    if (open <= 0 || high <= 0 || low <= 0 || close <= 0 || volume < 0) {
      continue;
    }

    klines.push({ time: ts, open, high, low, close, volume });
  }

  return klines;
}

export async function getMarketData(symbol: string, period: MarketDataPeriod = '3mo'): Promise<MarketDataResult> {
  const upper = symbol.trim().toUpperCase();
  const klines = await fetchYahooChart(upper, period);
  if (klines.length < 20) {
    throw new Error(`Insufficient data for ${upper}: ${klines.length} bars (need >= 20)`);
  }

  return {
    symbol: upper,
    latestPrice: klines[klines.length - 1].close,
    klines,
    dataPoints: klines.length,
  };
}

export const marketDataTool = createTool({
  id: 'get-market-data',
  description: 'Fetch historical daily OHLCV K-line data for a US stock from Yahoo Finance (free, no API key needed)',
  inputSchema: z.object({
    symbol: z.string().trim().min(1).max(20).regex(/^[A-Z0-9.^=-]+$/i).describe('US stock ticker, e.g. AAPL, TSLA, NVDA, SPY'),
    period: marketDataPeriodSchema.default('3mo').describe('Historical data range'),
  }),
  outputSchema: z.object({
    symbol: z.string(),
    latestPrice: z.number(),
    klines: z.array(KLineDataSchema),
    dataPoints: z.number(),
  }),
  execute: async ({ symbol, period }) => getMarketData(symbol, period),
});
