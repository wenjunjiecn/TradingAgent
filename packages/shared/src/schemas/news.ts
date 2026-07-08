import { z } from 'zod';

// ─── 新闻情绪 Schemas ────────────────────────────────────────────────

/** 新闻文章 */
export const NewsArticleSchema = z.object({
  title: z.string().describe('新闻标题'),
  source: z.string().describe('新闻来源'),
  url: z.string().describe('新闻链接'),
  publishedAt: z.string().describe('发布时间 ISO 8601'),
  summary: z.string().optional().describe('新闻摘要'),
  sentimentScore: z.number().min(-1).max(1).optional().describe('情绪评分 -1(极度看空) 到 1(极度看多)'),
});

/** 新闻情绪分析结果 */
export const NewsSentimentResultSchema = z.object({
  symbol: z.string(),
  articles: z.array(NewsArticleSchema),
  overallSentiment: z.enum(['positive', 'negative', 'neutral']).describe('整体情绪'),
  sentimentScore: z.number().min(-1).max(1).describe('整体情绪评分 -1 到 1'),
  articleCount: z.number().describe('文章数量'),
});

// ─── TypeScript Types ────────────────────────────────────────────────
export type NewsArticle = z.infer<typeof NewsArticleSchema>;
export type NewsSentimentResult = z.infer<typeof NewsSentimentResultSchema>;
