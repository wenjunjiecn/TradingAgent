import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { FundamentalsSchema, type Fundamentals } from '@trading-agent/shared';

const execFileAsync = promisify(execFile);
const YAHOO_TIMEOUT_MS = 12_000;

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
  'Accept': 'application/json',
  'Accept-Language': 'en-US,en;q=0.9',
};

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { headers: HEADERS, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchYahooQuoteSummary(symbol: string): Promise<any> {
  const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=summaryDetail,defaultKeyStatistics,financialData,assetProfile,price`;

  // 先尝试 fetch
  try {
    const response = await fetchWithTimeout(url, YAHOO_TIMEOUT_MS);
    if (response.ok) {
      return await response.json();
    }
  } catch {
    // fall through to curl
  }

  // curl fallback
  try {
    const { stdout } = await execFileAsync('curl', [
      '-fsSL',
      '--max-time', String(Math.ceil(YAHOO_TIMEOUT_MS / 1000)),
      '-H', `User-Agent: ${HEADERS['User-Agent']}`,
      '-H', `Accept: ${HEADERS.Accept}`,
      url,
    ], { maxBuffer: 10 * 1024 * 1024 });

    return JSON.parse(stdout);
  } catch (error) {
    throw new Error(`Yahoo Finance quoteSummary failed for ${symbol}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/** 安全提取数字 */
function num(val: any): number | undefined {
  if (val == null) return undefined;
  if (typeof val === 'number') return val;
  if (typeof val === 'object' && 'raw' in val) return typeof val.raw === 'number' ? val.raw : undefined;
  return undefined;
}

/** 安全提取字符串 */
function str(val: any): string | undefined {
  if (val == null) return undefined;
  if (typeof val === 'string') return val;
  return undefined;
}

export const fundamentalsTool = createTool({
  id: 'fundamentals',
  description: 'Fetch fundamental data (PE, PB, ROE, profit margin, revenue growth, debt/equity, etc.) for a US stock from Yahoo Finance. No API key needed.',
  inputSchema: z.object({
    symbol: z.string().trim().min(1).max(20).regex(/^[A-Z0-9.^=-]+$/i).describe('US stock ticker, e.g. AAPL'),
  }),
  outputSchema: FundamentalsSchema,
  execute: async ({ symbol }): Promise<Fundamentals> => {
    const upper = symbol.trim().toUpperCase();
    const data = await fetchYahooQuoteSummary(upper);

    const result = data?.quoteSummary?.result?.[0];
    if (!result) {
      throw new Error(`No fundamentals data found for ${upper}`);
    }

    const sd = result.summaryDetail ?? {};
    const ks = result.defaultKeyStatistics ?? {};
    const fd = result.financialData ?? {};
    const ap = result.assetProfile ?? {};
    const pr = result.price ?? {};

    return {
      symbol: upper,
      marketCap: num(sd.marketCap) ?? num(pr.marketCap),
      peRatio: num(sd.trailingPE),
      forwardPE: num(sd.forwardPE),
      pbRatio: num(sd.priceToBook) ?? num(ks.priceToBook),
      psRatio: num(sd.priceToSalesTrailing12Months),
      pegRatio: num(sd.pegRatio) ?? num(ks.pegRatio),
      dividendYield: num(sd.dividendYield),
      beta: num(sd.beta),
      profitMargin: num(fd.profitMargins),
      revenueGrowth: num(fd.revenueGrowth),
      earningsGrowth: num(fd.earningsGrowth),
      debtToEquity: num(fd.debtToEquity),
      returnOnEquity: num(fd.returnOnEquity),
      returnOnAssets: num(fd.returnOnAssets),
      currentRatio: num(fd.currentRatio),
      freeCashFlow: num(fd.freeCashflow),
      grossMargin: num(fd.grossMargins),
      operatingMargin: num(fd.operatingMargins),
      sector: str(ap.sector),
      industry: str(ap.industry),
    };
  },
});
