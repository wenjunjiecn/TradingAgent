import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { KLineDataSchema, type KLineData } from '@trading-agent/shared';

interface YahooChartResponse {
  chart: {
    result: Array<{
      meta: { regularMarketPrice: number; symbol: string };
      timestamp: number[];
      indicators: {
        quote: Array<{
          open: (number | null)[];
          high: (number | null)[];
          low: (number | null)[];
          close: (number | null)[];
          volume: (number | null)[];
        }>;
      };
    }> | null;
    error: { code: string; description: string } | null;
  };
}

async function fetchYahooChart(symbol: string, range: string): Promise<KLineData[]> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=1d&includePrePost=false`;
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      'Accept': 'application/json',
      'Accept-Language': 'en-US,en;q=0.9',
    },
  });
  if (!response.ok) {
    throw new Error(`Yahoo Finance API error: HTTP ${response.status} for ${symbol}`);
  }
  const data = (await response.json()) as YahooChartResponse;
  if (data.chart.error) {
    throw new Error(`Yahoo Finance error: ${data.chart.error.description}`);
  }
  const result = data.chart.result?.[0];
  if (!result) throw new Error(`No data found for symbol: ${symbol}`);

  const timestamps = result.timestamp;
  const quote = result.indicators.quote[0]!;
  return timestamps
    .map((ts, i): KLineData => ({
      time: ts,
      open: quote.open[i] ?? 0,
      high: quote.high[i] ?? 0,
      low: quote.low[i] ?? 0,
      close: quote.close[i] ?? 0,
      volume: quote.volume[i] ?? 0,
    }))
    .filter(k => k.close > 0);
}

export const marketDataTool = createTool({
  id: 'get-market-data',
  description: 'Fetch historical daily OHLCV K-line data for a US stock from Yahoo Finance (free, no API key needed)',
  inputSchema: z.object({
    symbol: z.string().describe('US stock ticker, e.g. AAPL, TSLA, NVDA, SPY'),
    period: z.enum(['1mo', '3mo', '6mo', '1y']).default('3mo').describe('Historical data range'),
  }),
  outputSchema: z.object({
    symbol: z.string(),
    latestPrice: z.number(),
    klines: z.array(KLineDataSchema),
    dataPoints: z.number(),
  }),
  execute: async ({ symbol, period }: { symbol: string; period: string }) => {
    const upper = symbol.toUpperCase();
    const klines = await fetchYahooChart(upper, period);
    if (klines.length < 20) {
      throw new Error(`Insufficient data for ${upper}: ${klines.length} bars (need >= 20)`);
    }
    return {
      symbol: upper,
      latestPrice: klines[klines.length - 1]!.close,
      klines,
      dataPoints: klines.length,
    };
  },
});
