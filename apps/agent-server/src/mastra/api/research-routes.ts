import type { ApiRoute } from '@mastra/core/server';
import {
  listAgentConfigs,
  getAgentConfig,
  createAgentConfig,
  updateAgentConfig,
  deleteAgentConfig,
  createAgentFromTemplate,
} from '../agents/agent-registry';
import { agentTemplates } from '../agents/agent-templates';
import { teamRoutes } from './team-routes';
import { teamChatRoutes } from './team-chat-routes';
import { toolRoutes } from './tool-routes';
import { skillRoutes } from './skill-routes';
import {
  initReportStore,
  listReports,
  listReportSummaries,
  getReport,
  deleteReport,
  getReportStats,
} from '../reports/report-store';
import { getMarketData } from '../tools/market-data-tool';
import { calculateIndicators } from '../tools/technical-analysis-tool';
import { executeCollaboration } from '../workflows/collaboration-engine';
import { listAgentConfigSummaries } from '../agents/agent-registry';
import type { CollaborationPattern } from '@trading-agent/shared';

/**
 * 投研 REST API 路由
 *
 * 暴露投研核心能力为 HTTP 端点，供前端 Desktop 应用调用。
 * 所有路由以 /api 为前缀（Mastra 默认 apiPrefix）。
 */

// ── 报告路由 ──────────────────────────────────────────────────────────

const listReportsRoute: ApiRoute = {
  path: '/research/reports',
  method: 'GET',
  handler: async (c: any) => {
    await initReportStore();
    const symbol = c.req.query('symbol');
    const limit = parseInt(c.req.query('limit') ?? '50', 10);
    const offset = parseInt(c.req.query('offset') ?? '0', 10);
    // 默认返回摘要（轻量），full=true 时返回完整报告
    const full = c.req.query('full') === 'true';
    if (full) {
      const reports = await listReports({ symbol, limit, offset });
      return c.json({ reports });
    }
    const reports = await listReportSummaries({ symbol, limit, offset });
    return c.json({ reports });
  },
};

const getReportRoute: ApiRoute = {
  path: '/research/reports/:id',
  method: 'GET',
  handler: async (c: any) => {
    await initReportStore();
    const id = c.req.param('id');
    const report = await getReport(id);
    if (!report) {
      return c.json({ error: 'Report not found' }, 404);
    }
    return c.json({ report });
  },
};

const deleteReportRoute: ApiRoute = {
  path: '/research/reports/:id',
  method: 'DELETE',
  handler: async (c: any) => {
    await initReportStore();
    const id = c.req.param('id');
    const deleted = await deleteReport(id);
    if (!deleted) {
      return c.json({ error: 'Report not found' }, 404);
    }
    return c.json({ success: true });
  },
};

const reportStatsRoute: ApiRoute = {
  path: '/research/reports/stats',
  method: 'GET',
  handler: async (c: any) => {
    await initReportStore();
    const stats = await getReportStats();
    return c.json({ stats });
  },
};

/**
 * Dashboard 聚合端点 —— 一次请求返回统计 + 最近报告摘要。
 * 消除前端 2 次串行请求的往返延迟。
 */
const dashboardRoute: ApiRoute = {
  path: '/research/dashboard',
  method: 'GET',
  handler: async (c: any) => {
    await initReportStore();
    const recentLimit = parseInt(c.req.query('recentLimit') ?? '8', 10);
    // 并行执行统计 + 最近报告摘要
    const [stats, recentReports] = await Promise.all([
      getReportStats(),
      listReportSummaries({ limit: recentLimit }),
    ]);
    return c.json({ stats, recentReports });
  },
};

// ── 协作投研路由 ──────────────────────────────────────────────────────

const startCollaborationRoute: ApiRoute = {
  path: '/research/collaboration/start',
  method: 'POST',
  handler: async (c: any) => {
    try {
      const body = await c.req.json();
      const { symbol, pattern, participantAgentIds, supervisorAgentId } = body;

      if (!symbol) {
        return c.json({ error: 'Symbol is required' }, 400);
      }

      const result = await executeCollaboration(c.get('mastra'), {
        symbol: symbol.toUpperCase(),
        pattern: (pattern ?? 'council') as CollaborationPattern,
        participantAgentIds: participantAgentIds ?? [
          'trading-agent',
          'market-analysis-agent',
          'sentiment-analysis-agent',
          'risk-analysis-agent',
        ],
        supervisorAgentId: supervisorAgentId ?? 'research-supervisor',
      });

      return c.json({ result });
    } catch (error) {
      console.error('[Collaboration API] Error:', error);
      const message = error instanceof Error ? error.message : String(error);
      return c.json({ error: message }, 500);
    }
  },
};

// ── Agent 配置路由 ────────────────────────────────────────────────────

const listAgentsRoute: ApiRoute = {
  path: '/research/agents',
  method: 'GET',
  handler: async (c: any) => {
    // 默认返回摘要（轻量），full=true 时返回完整配置
    const full = c.req.query('full') === 'true';
    if (full) {
      const { listAgentConfigs } = await import('../agents/agent-registry');
      const configs = await listAgentConfigs();
      return c.json({ agents: configs });
    }
    const summaries = await listAgentConfigSummaries();
    return c.json({ agents: summaries });
  },
};

const getAgentRoute: ApiRoute = {
  path: '/research/agents/:id',
  method: 'GET',
  handler: async (c: any) => {
    const id = c.req.param('id');
    const config = await getAgentConfig(id);
    if (!config) {
      return c.json({ error: 'Agent not found' }, 404);
    }
    return c.json({ agent: config });
  },
};

const createAgentRoute: ApiRoute = {
  path: '/research/agents',
  method: 'POST',
  handler: async (c: any) => {
    try {
      const body = await c.req.json();
      const config = await createAgentConfig(body);
      return c.json({ agent: config }, 201);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return c.json({ error: message }, 500);
    }
  },
};

const updateAgentRoute: ApiRoute = {
  path: '/research/agents/:id',
  method: 'PUT',
  handler: async (c: any) => {
    try {
      const id = c.req.param('id');
      const updates = await c.req.json();
      const config = await updateAgentConfig(id, updates);
      if (!config) {
        return c.json({ error: 'Agent not found' }, 404);
      }
      return c.json({ agent: config });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return c.json({ error: message }, 500);
    }
  },
};

const deleteAgentRoute: ApiRoute = {
  path: '/research/agents/:id',
  method: 'DELETE',
  handler: async (c: any) => {
    const id = c.req.param('id');
    const deleted = await deleteAgentConfig(id);
    if (!deleted) {
      return c.json({ error: 'Agent not found' }, 404);
    }
    return c.json({ success: true });
  },
};

const listAgentTemplatesRoute: ApiRoute = {
  path: '/research/agent-templates',
  method: 'GET',
  handler: async (c: any) => {
    return c.json({ templates: agentTemplates });
  },
};

const createAgentFromTemplateRoute: ApiRoute = {
  path: '/research/agents/from-template',
  method: 'POST',
  handler: async (c: any) => {
    try {
      const { templateId, customName } = await c.req.json();
      const config = await createAgentFromTemplate(templateId, customName);
      if (!config) {
        return c.json({ error: 'Template not found' }, 404);
      }
      return c.json({ agent: config }, 201);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return c.json({ error: message }, 500);
    }
  },
};

// ── 行情数据路由 ──────────────────────────────────────────────────────

const getMarketDataRoute: ApiRoute = {
  path: '/research/market-data/:symbol',
  method: 'GET',
  handler: async (c: any) => {
    try {
      const symbol = c.req.param('symbol');
      const period = c.req.query('period') ?? '3mo';
      const data = await getMarketData(symbol, period as any);
      return c.json({ data });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return c.json({ error: message }, 500);
    }
  },
};

const getIndicatorsRoute: ApiRoute = {
  path: '/research/indicators/:symbol',
  method: 'GET',
  handler: async (c: any) => {
    try {
      const symbol = c.req.param('symbol');
      const period = c.req.query('period') ?? '3mo';
      const data = await getMarketData(symbol, period as any);
      const indicators = calculateIndicators(data.klines as any);
      return c.json({
        symbol: data.symbol,
        latestPrice: data.latestPrice,
        indicators,
        dataPoints: data.dataPoints,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return c.json({ error: message }, 500);
    }
  },
};

// ── 导出所有路由 ──────────────────────────────────────────────────────

export const researchRoutes: ApiRoute[] = [
  // Dashboard (聚合端点，放在 /reports/:id 之前避免路由冲突)
  dashboardRoute,
  // Reports
  listReportsRoute,
  getReportRoute,
  deleteReportRoute,
  reportStatsRoute,
  // Collaboration
  startCollaborationRoute,
  // Agent configs
  listAgentsRoute,
  getAgentRoute,
  createAgentRoute,
  updateAgentRoute,
  deleteAgentRoute,
  listAgentTemplatesRoute,
  createAgentFromTemplateRoute,
  // Agent Team configs + execution
  ...teamRoutes,
  // Agent Team chat (streaming)
  ...teamChatRoutes,
  // Tool configs
  ...toolRoutes,
  // Skill configs
  ...skillRoutes,
  // Market data
  getMarketDataRoute,
  getIndicatorsRoute,
];
