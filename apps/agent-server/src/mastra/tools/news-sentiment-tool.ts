import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import {
  NewsArticleSchema,
  NewsSentimentResultSchema,
  type NewsArticle,
  type NewsSentimentResult,
} from '@trading-agent/shared';

const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY;
const FINNHUB_TIMEOUT_MS = 12_000;

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

/** 简单关键词情绪分析（无外部 NLP 依赖） */
function analyzeSentiment(title: string, summary?: string): number {
  const text = `${title} ${summary ?? ''}`.toLowerCase();

  const positiveKeywords = [
    'beat', 'beats', 'surpass', 'exceed', 'strong', 'growth', 'gain', 'gains',
    'profit', 'rally', 'surge', 'jump', 'rise', 'rising', 'bull', 'bullish',
    'upgrade', 'outperform', 'buy', 'positive', 'optimistic', 'record',
    '增长', '利好', '突破', '上涨', '强劲', '超预期', '盈利', '牛市',
  ];
  const negativeKeywords = [
    'miss', 'misses', 'fall', 'falls', 'drop', 'drops', 'decline', 'weak',
    'loss', 'losses', 'sell', 'sell-off', 'bear', 'bearish', 'downgrade',
    'underperform', 'warning', 'concern', 'risk', 'lawsuit', 'investigation',
    '下跌', '利空', '亏损', '警告', '风险', '诉讼', '调查', '熊市',
  ];

  let score = 0;
  for (const kw of positiveKeywords) {
    if (text.includes(kw)) score += 1;
  }
  for (const kw of negativeKeywords) {
    if (text.includes(kw)) score -= 1;
  }

  // 归一化到 [-1, 1]
  return Math.max(-1, Math.min(1, score / 3));
}

/** 从 Finnhub 获取公司新闻 */
async function fetchFinnhubNews(symbol: string, limit: number): Promise<NewsArticle[]> {
  if (!FINNHUB_API_KEY) {
    return [];
  }

  const now = new Date();
  const from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000); // 30 天前
  const fromStr = from.toISOString().slice(0, 10);
  const toStr = now.toISOString().slice(0, 10);

  const url = `https://finnhub.io/api/v1/company-news?symbol=${encodeURIComponent(symbol)}&from=${fromStr}&to=${toStr}&token=${FINNHUB_API_KEY}`;

  const response = await fetchWithTimeout(url, FINNHUB_TIMEOUT_MS);
  if (!response.ok) {
    throw new Error(`Finnhub API error: HTTP ${response.status}`);
  }

  const data = await response.json() as Array<{
    headline: string;
    source: string;
    url: string;
    datetime: number;
    summary: string;
  }>;

  return data.slice(0, limit).map(item => {
    const sentimentScore = analyzeSentiment(item.headline, item.summary);
    return {
      title: item.headline,
      source: item.source,
      url: item.url,
      publishedAt: new Date(item.datetime * 1000).toISOString(),
      summary: item.summary?.slice(0, 200),
      sentimentScore,
    };
  });
}

export const newsSentimentTool = createTool({
  id: 'news-sentiment',
  description: 'Fetch recent company news and analyze sentiment for a US stock. Requires FINNHUB_API_KEY environment variable. Returns articles with sentiment scores.',
  inputSchema: z.object({
    symbol: z.string().trim().min(1).max(20).regex(/^[A-Z0-9.^=-]+$/i).describe('US stock ticker, e.g. AAPL'),
    limit: z.number().min(1).max(50).default(10).describe('Max number of articles to return'),
  }),
  outputSchema: NewsSentimentResultSchema,
  execute: async ({ symbol, limit }): Promise<NewsSentimentResult> => {
    const upper = symbol.trim().toUpperCase();

    let articles: NewsArticle[] = [];
    try {
      articles = await fetchFinnhubNews(upper, limit);
    } catch (error) {
      console.warn(`[NewsSentiment] Failed to fetch news for ${upper}:`, error instanceof Error ? error.message : String(error));
    }

    // 计算整体情绪
    const avgScore = articles.length > 0
      ? articles.reduce((sum, a) => sum + (a.sentimentScore ?? 0), 0) / articles.length
      : 0;

    const overallSentiment: 'positive' | 'negative' | 'neutral' =
      avgScore > 0.15 ? 'positive' : avgScore < -0.15 ? 'negative' : 'neutral';

    return {
      symbol: upper,
      articles,
      overallSentiment,
      sentimentScore: Math.round(avgScore * 100) / 100,
      articleCount: articles.length,
    };
  },
});
