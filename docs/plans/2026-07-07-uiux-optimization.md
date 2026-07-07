# 客户端 UI/UX 优化实施计划

> **For agentic workers:** Steps use checkbox (`- [ ]`) syntax for tracking. Each Task is self-contained with files, interfaces, code, and verification commands.

**Goal:** 将通用 Mastra Studio 桌面端改造为投研场景导向的客户端——投研看板首页、报告中心、协同投研编排器、行情可视化，并暴露后端已有能力的 REST API。

**Architecture:** 后端通过 Mastra `server.apiRoutes` 新增 `/api/research/*` 自定义路由，桥接 `report-store`、`collaboration-engine`、`agent-registry`、`workflow-config-store`。前端新增 `domains/dashboard`、`domains/reports`、`domains/collaboration`、`domains/market` 四个域，重构 `lib/nav/nav-items.tsx` 导航，在 `App.tsx` 注册新路由。

**Tech Stack:** TypeScript, React, React Router, TanStack Query, Mastra, LibSQL, Tailwind CSS, `@mastra/playground-ui`

## Global Constraints

- 后端已有函数（`executeCollaboration`、`listReports`、`listAgentConfigs` 等）不修改，仅通过 Mastra custom routes 暴露为 HTTP API
- 前端复用 `@mastra/playground-ui` 组件库（Button、PageLayout、DataList 等），不引入新 UI 库
- 行情图表使用 `lightweight-charts`（~40KB gzip），在 Task 5 中安装
- 所有新页面遵循现有 `Layout` 布局（左 Sidebar + RouteHeader + 圆角主面板）
- 路由必须注册到 `App.tsx` 的 `routes` 数组，并通过 `navHandle()` 关联导航高亮
- TypeScript strict mode，`npx tsc --noEmit` 必须通过

---

## Task 0: 后端 API 路由 — 暴露投研能力为 REST 端点

**Files:**
- Create: `apps/agent-server/src/mastra/api/research-routes.ts`
- Modify: `apps/agent-server/src/mastra/index.ts`

**Interfaces:**
- Consumes: `listReports`, `getReport`, `deleteReport`, `listReportSummaries` from `reports/report-store.ts`; `executeCollaboration` from `workflows/collaboration-engine.ts`; `listAgentConfigs`, `getAgentConfig`, `createAgentConfig`, `updateAgentConfig`, `deleteAgentConfig` from `agents/agent-registry.ts`; `listWorkflowConfigs`, `createWorkflowConfig`, `deleteWorkflowConfig` from `workflows/workflow-config-store.ts`; `getMarketData`, `calculateIndicators` from tools
- Produces: Mastra `API_ROUTE` objects registered in `index.ts`

- [ ] **Step 1: 创建 `research-routes.ts`**

```typescript
// apps/agent-server/src/mastra/api/research-routes.ts
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { listReports, getReport, deleteReport, listReportSummaries } from '../reports/report-store';
import { executeCollaboration } from '../workflows/collaboration-engine';
import {
  listAgentConfigs,
  getAgentConfig,
  createAgentConfig,
  updateAgentConfig,
  deleteAgentConfig,
} from '../agents/agent-registry';
import {
  listWorkflowConfigs,
  createWorkflowConfig,
  deleteWorkflowConfig,
} from '../workflows/workflow-config-store';
import { getMarketData } from '../tools/market-data-tool';
import { calculateIndicators } from '../tools/technical-analysis-tool';

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { 'Content-Type': 'application/json' },
});

const err = (message: string, status = 400) => json({ error: message }, status);

// ── 报告 API ──────────────────────────────────────────

export const listReportsRoute = {
  path: '/api/research/reports',
  method: 'GET' as const,
  handler: async (c) => {
    const url = new URL(c.req.url);
    const symbol = url.searchParams.get('symbol') ?? undefined;
    const action = url.searchParams.get('action') ?? undefined;
    const limit = Number(url.searchParams.get('limit') ?? 20);
    const offset = Number(url.searchParams.get('offset') ?? 0);

    try {
      const result = await listReports({ symbol, action, limit, offset });
      return json(result);
    } catch (e) {
      return err((e as Error).message, 500);
    }
  },
};

export const getReportRoute = {
  path: '/api/research/reports/:id',
  method: 'GET' as const,
  handler: async (c) => {
    const id = c.req.param('id');
    const report = await getReport(id);
    if (!report) return err('Report not found', 404);
    return json(report);
  },
};

export const deleteReportRoute = {
  path: '/api/research/reports/:id',
  method: 'DELETE' as const,
  handler: async (c) => {
    const id = c.req.param('id');
    const ok = await deleteReport(id);
    if (!ok) return err('Report not found', 404);
    return json({ success: true });
  },
};

// ── 协作投研 API ──────────────────────────────────────

const executeCollaborationSchema = z.object({
  symbol: z.string(),
  pattern: z.enum(['council', 'pipeline', 'debate', 'hierarchical', 'parallel-scan']),
  participantAgentIds: z.array(z.string()),
  supervisorAgentId: z.string().optional(),
  symbols: z.array(z.string()).optional(),
});

export const executeCollaborationRoute = {
  path: '/api/research/collaboration/execute',
  method: 'POST' as const,
  handler: async (c) => {
    try {
      const body = await c.req.json();
      const input = executeCollaborationSchema.parse(body);
      const mastra = c.get('mastra');
      const report = await executeCollaboration(mastra, input);
      return json(report);
    } catch (e) {
      return err((e as Error).message, 500);
    }
  },
};

// ── Agent 配置 API ────────────────────────────────────

export const listAgentConfigsRoute = {
  path: '/api/research/agents',
  method: 'GET' as const,
  handler: async () => {
    const configs = await listAgentConfigs();
    return json(configs);
  },
};

export const createAgentConfigRoute = {
  path: '/api/research/agents',
  method: 'POST' as const,
  handler: async (c) => {
    try {
      const body = await c.req.json();
      const config = await createAgentConfig(body);
      return json(config, 201);
    } catch (e) {
      return err((e as Error).message);
    }
  },
};

export const updateAgentConfigRoute = {
  path: '/api/research/agents/:id',
  method: 'PUT' as const,
  handler: async (c) => {
    try {
      const id = c.req.param('id');
      const body = await c.req.json();
      const config = await updateAgentConfig(id, body);
      if (!config) return err('Agent not found', 404);
      return json(config);
    } catch (e) {
      return err((e as Error).message);
    }
  },
};

export const deleteAgentConfigRoute = {
  path: '/api/research/agents/:id',
  method: 'DELETE' as const,
  handler: async (c) => {
    const id = c.req.param('id');
    const ok = await deleteAgentConfig(id);
    if (!ok) return err('Agent not found', 404);
    return json({ success: true });
  },
};

// ── 工作流模板 API ────────────────────────────────────

export const listWorkflowConfigsRoute = {
  path: '/api/research/workflow-configs',
  method: 'GET' as const,
  handler: async () => {
    const configs = await listWorkflowConfigs();
    return json(configs);
  },
};

export const createWorkflowConfigRoute = {
  path: '/api/research/workflow-configs',
  method: 'POST' as const,
  handler: async (c) => {
    try {
      const body = await c.req.json();
      const config = await createWorkflowConfig(
        body.name,
        body.pattern,
        body.participantAgentIds,
        body.supervisorAgentId,
        body.symbols,
      );
      return json(config, 201);
    } catch (e) {
      return err((e as Error).message);
    }
  },
};

export const deleteWorkflowConfigRoute = {
  path: '/api/research/workflow-configs/:id',
  method: 'DELETE' as const,
  handler: async (c) => {
    const id = c.req.param('id');
    const ok = await deleteWorkflowConfig(id);
    if (!ok) return err('Config not found', 404);
    return json({ success: true });
  },
};

// ── 行情数据 API ──────────────────────────────────────

export const getMarketDataRoute = {
  path: '/api/research/market/:symbol',
  method: 'GET' as const,
  handler: async (c) => {
    try {
      const symbol = c.req.param('symbol');
      const period = (new URL(c.req.url).searchParams.get('period') ?? '3mo') as '1mo' | '3mo' | '6mo' | '1y';
      const data = await getMarketData(symbol, period);
      const indicators = calculateIndicators(data.klines);
      return json({ ...data, indicators });
    } catch (e) {
      return err((e as Error).message, 500);
    }
  },
};
```

- [ ] **Step 2: 在 `index.ts` 中注册路由**

在 `apps/agent-server/src/mastra/index.ts` 中，import 并注册所有路由：

```typescript
// 在文件顶部 import 区添加：
import {
  listReportsRoute,
  getReportRoute,
  deleteReportRoute,
  executeCollaborationRoute,
  listAgentConfigsRoute,
  createAgentConfigRoute,
  updateAgentConfigRoute,
  deleteAgentConfigRoute,
  listWorkflowConfigsRoute,
  createWorkflowConfigRoute,
  deleteWorkflowConfigRoute,
  getMarketDataRoute,
} from './api/research-routes';

// 在 `new Mastra({ ... })` 中添加 server.apiRoutes：
export const mastra = new Mastra({
  // ... 现有配置 ...
  server: {
    middleware: desktopAuthMiddleware,
    cors: { /* 现有配置不变 */ },
    apiRoutes: [
      listReportsRoute,
      getReportRoute,
      deleteReportRoute,
      executeCollaborationRoute,
      listAgentConfigsRoute,
      createAgentConfigRoute,
      updateAgentConfigRoute,
      deleteAgentConfigRoute,
      listWorkflowConfigsRoute,
      createWorkflowConfigRoute,
      deleteWorkflowConfigRoute,
      getMarketDataRoute,
    ],
  },
});
```

- [ ] **Step 3: 验证编译**

```bash
cd /Users/wenjunjie/Documents/antigravity/jolly-curie/apps/agent-server && npx tsc --noEmit 2>&1 | head -30
```

预期：无 error

- [ ] **Step 4: 启动验证 API**

```bash
cd /Users/wenjunjie/Documents/antigravity/jolly-curie && npm run dev:agent &
sleep 5
curl -s http://localhost:4111/api/research/reports | head -100
curl -s http://localhost:4111/api/research/agents | head -100
curl -s http://localhost:4111/api/research/market/AAPL | head -100
```

预期：三个端点都返回 JSON 数据

- [ ] **Step 5: Commit**

```bash
cd /Users/wenjunjie/Documents/antigravity/jolly-curie
git add apps/agent-server/src/mastra/api/ apps/agent-server/src/mastra/index.ts
git commit -m "feat(server): expose research REST API routes for reports, collaboration, agents, market data"
```

---

## Task 1: 导航重构 — 投研场景导向

**Files:**
- Modify: `apps/desktop/src/renderer/lib/nav/nav-items.tsx`
- Modify: `apps/desktop/src/renderer/App.tsx`

**Interfaces:**
- Consumes: existing `NavItem`, `NavSection` types
- Produces: restructured `mainNav` with investment-research-first ordering

- [ ] **Step 1: 重写 `nav-items.tsx`**

将导航分为三组：投研（看板/协同投研/报告中心/自选股）、投研团队（投研角色/工作流/工具）、高级（MCP/技能库）。现有的 Agents/Workflows/Tools 保持原 url 不变，仅改组与名称。

```typescript
// apps/desktop/src/renderer/lib/nav/nav-items.tsx — 完整替换
import { AgentIcon } from '@mastra/playground-ui/icons/AgentIcon';
import { McpServerIcon } from '@mastra/playground-ui/icons/McpServerIcon';
import { SettingsIcon } from '@mastra/playground-ui/icons/SettingsIcon';
import { ToolsIcon } from '@mastra/playground-ui/icons/ToolsIcon';
import { WorkflowIcon } from '@mastra/playground-ui/icons/WorkflowIcon';
import { WorkspacesIcon } from '@mastra/playground-ui/icons/WorkspacesIcon';
import { LayoutDashboard, Network, FileChartColumn, Star } from 'lucide-react';
import type { ComponentType, SVGProps } from 'react';

export type NavIcon = ComponentType<SVGProps<SVGSVGElement>>;

export interface NavItem {
  name: string;
  url: string;
  Icon: NavIcon;
  docs?: { href: string; label?: string };
  isOnMastraPlatform?: boolean;
  activePaths?: string[];
}

export interface NavSection {
  key: string;
  title: string;
  href?: string;
  items: NavItem[];
}

export const mainNav: NavSection[] = [
  {
    key: 'research',
    title: '投研',
    items: [
      {
        name: '看板',
        url: '/dashboard',
        Icon: LayoutDashboard,
        isOnMastraPlatform: true,
        activePaths: ['/dashboard'],
      },
      {
        name: '协同投研',
        url: '/collaboration',
        Icon: Network,
        isOnMastraPlatform: true,
        activePaths: ['/collaboration'],
      },
      {
        name: '报告中心',
        url: '/reports',
        Icon: FileChartColumn,
        isOnMastraPlatform: true,
        activePaths: ['/reports'],
      },
      {
        name: '投研角色',
        url: '/agents',
        Icon: AgentIcon,
        docs: { href: 'https://mastra.ai/en/docs/agents/overview', label: 'Agents documentation' },
        isOnMastraPlatform: true,
      },
    ],
  },
  {
    key: 'team',
    title: '团队与工具',
    items: [
      {
        name: '工作流',
        url: '/workflows',
        Icon: WorkflowIcon,
        docs: { href: 'https://mastra.ai/en/docs/workflows/overview', label: 'Workflows documentation' },
        isOnMastraPlatform: true,
      },
      {
        name: '工具',
        url: '/tools',
        Icon: ToolsIcon,
        docs: { href: 'https://mastra.ai/en/docs/agents/using-tools-and-mcp', label: 'Tools documentation' },
        isOnMastraPlatform: true,
      },
      {
        name: '技能库',
        url: '/workspaces',
        Icon: WorkspacesIcon,
        docs: { href: 'https://mastra.ai/en/docs/workspace/skills', label: 'Skills documentation' },
        isOnMastraPlatform: true,
      },
      {
        name: 'MCP 服务器',
        url: '/mcps',
        Icon: McpServerIcon,
        docs: { href: 'https://mastra.ai/en/docs/tools-mcp/mcp-overview', label: 'MCP documentation' },
        isOnMastraPlatform: true,
      },
    ],
  },
];

export const bottomNav: NavItem[] = [
  { name: '设置', url: '/settings', Icon: SettingsIcon, isOnMastraPlatform: false },
];

export const sectionNav: NavItem[] = [];

const allItems: NavItem[] = [...sectionNav, ...mainNav.flatMap(s => s.items), ...bottomNav];

export function findNavItem(url: string): NavItem | undefined {
  return allItems.find(i => i.url === url);
}
```

- [ ] **Step 2: 在 `App.tsx` 中添加 `/dashboard` 路由占位 + 修改默认重定向**

在 `routes` 数组中，找到 `{ index: true, element: <StudioIndexRedirect /> }`，改为重定向到 `/dashboard`：

```typescript
// 在 App.tsx 顶部 import 区添加：
import { DashboardPage } from '@/pages/dashboard';

// 在 routes 数组 RootLayout children 的末尾，替换 index route：
{
  index: true,
  loader: () => redirect('/dashboard'),
  handle: { crumbs: [{ id: 'home', label: '首页' }] },
},
```

同时在 `routes` 中 RootLayout children 的其他路由之后添加：

```typescript
{ path: '/dashboard', element: <DashboardPage />, handle: navHandle('/dashboard') },
```

- [ ] **Step 3: 创建 Dashboard 页面占位文件**

```bash
mkdir -p /Users/wenjunjie/Documents/antigravity/jolly-curie/apps/desktop/src/renderer/pages/dashboard
```

```typescript
// apps/desktop/src/renderer/pages/dashboard/index.tsx
import { PageLayout } from '@mastra/playground-ui/components/PageLayout';

export function DashboardPage() {
  return (
    <PageLayout>
      <PageLayout.TopArea>
        <h1 className="text-2xl font-semibold text-neutral6">投研看板</h1>
        <p className="mt-1 text-sm text-neutral3">自选股、最近报告、跟踪条件一览</p>
      </PageLayout.TopArea>
      <PageLayout.MainArea>
        <div className="p-6 text-neutral3">Dashboard 内容将在 Task 2 中实现</div>
      </PageLayout.MainArea>
    </PageLayout>
  );
}

export default DashboardPage;
```

- [ ] **Step 4: 验证编译**

```bash
cd /Users/wenjunjie/Documents/antigravity/jolly-curie/apps/desktop && npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 5: 验证运行**

```bash
cd /Users/wenjunjie/Documents/antigravity/jolly-curie && npm run dev:desktop &
```

确认：侧边栏显示「投研」「团队与工具」两组导航，应用启动后自动跳转到 `/dashboard`。

- [ ] **Step 6: Commit**

```bash
cd /Users/wenjunjie/Documents/antigravity/jolly-curie
git add apps/desktop/src/renderer/lib/nav/ apps/desktop/src/renderer/App.tsx apps/desktop/src/renderer/pages/dashboard/
git commit -m "feat(desktop): restructure navigation for investment-research workflow, add dashboard route"
```

---

## Task 2: 投研看板首页（Dashboard）

**Files:**
- Create: `apps/desktop/src/renderer/domains/dashboard/components/watchlist-panel.tsx`
- Create: `apps/desktop/src/renderer/domains/dashboard/components/recent-reports-panel.tsx`
- Create: `apps/desktop/src/renderer/domains/dashboard/components/quick-research-button.tsx`
- Create: `apps/desktop/src/renderer/hooks/use-watchlist.ts`
- Modify: `apps/desktop/src/renderer/pages/dashboard/index.tsx`

**Interfaces:**
- Consumes: `GET /api/research/reports?limit=5` (Task 0 API), `GET /api/research/market/:symbol` (Task 0 API)
- Produces: `DashboardPage` with watchlist + recent reports + quick research entry

- [ ] **Step 1: 创建自选股 hook**

```typescript
// apps/desktop/src/renderer/hooks/use-watchlist.ts
import { useCallback, useEffect, useState } from 'react';

export interface WatchlistItem {
  symbol: string;
  addedAt: string;
}

const STORAGE_KEY = 'trading-agent:watchlist';

function loadFromStorage(): WatchlistItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function useWatchlist() {
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>(loadFromStorage);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(watchlist));
  }, [watchlist]);

  const addSymbol = useCallback((symbol: string) => {
    const upper = symbol.trim().toUpperCase();
    if (!upper) return;
    setWatchlist(prev => {
      if (prev.some(item => item.symbol === upper)) return prev;
      return [...prev, { symbol: upper, addedAt: new Date().toISOString() }];
    });
  }, []);

  const removeSymbol = useCallback((symbol: string) => {
    setWatchlist(prev => prev.filter(item => item.symbol !== symbol));
  }, []);

  return { watchlist, addSymbol, removeSymbol };
}
```

- [ ] **Step 2: 创建自选股面板组件**

```typescript
// apps/desktop/src/renderer/domains/dashboard/components/watchlist-panel.tsx
import { Button } from '@mastra/playground-ui/components/Button';
import { ArrowUp, ArrowDown, Plus, X, Zap } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';

interface WatchlistRow {
  symbol: string;
  price?: number;
  changePct?: number;
  loading?: boolean;
}

interface WatchlistPanelProps {
  symbols: string[];
  onAdd: (symbol: string) => void;
  onRemove: (symbol: string) => void;
  onQuickResearch: (symbol: string) => void;
}

export function WatchlistPanel({ symbols, onAdd, onRemove, onQuickResearch }: WatchlistPanelProps) {
  const [input, setInput] = useState('');
  const [rows, setRows] = useState<Record<string, WatchlistRow>>({});

  // 简化：实际行情数据在 Task 5 中通过 API 拉取，这里先用占位
  // TODO Task 5: 用 useMarketData hook 轮询各标的行情

  const handleAdd = () => {
    if (input.trim()) {
      onAdd(input.trim().toUpperCase());
      setInput('');
    }
  };

  return (
    <div className="rounded-lg border border-border1 bg-surface3/75 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-neutral6">自选股</h3>
        <span className="text-xs text-neutral3">{symbols.length} 个标的</span>
      </div>

      {symbols.length === 0 ? (
        <div className="py-6 text-center text-xs text-neutral3">
          添加标的开始跟踪
        </div>
      ) : (
        <div className="space-y-1">
          {symbols.map(symbol => {
            const row = rows[symbol] ?? { symbol, loading: true };
            return (
              <div
                key={symbol}
                className="group flex items-center justify-between rounded-md px-2 py-1.5 hover:bg-surface4/60"
              >
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm font-medium text-neutral6">{symbol}</span>
                  {row.price != null && (
                    <span className="font-mono text-xs text-neutral4">${row.price.toFixed(2)}</span>
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  {row.changePct != null && (
                    <span
                      className={cn(
                        'flex items-center gap-0.5 text-xs font-mono',
                        row.changePct >= 0 ? 'text-emerald-400' : 'text-rose-400',
                      )}
                    >
                      {row.changePct >= 0 ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />}
                      {Math.abs(row.changePct).toFixed(2)}%
                    </span>
                  )}
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => onQuickResearch(symbol)}
                    className="opacity-0 transition-opacity group-hover:opacity-100"
                    tooltip="快速投研"
                  >
                    <Zap className="size-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => onRemove(symbol)}
                    className="opacity-0 transition-opacity group-hover:opacity-100 text-neutral3 hover:text-rose-400"
                  >
                    <X className="size-3" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-3 flex gap-2">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleAdd()}
          placeholder="输入代码如 AAPL"
          className="flex-1 rounded-md border border-border1 bg-surface2 px-2.5 py-1.5 text-sm text-neutral6 placeholder:text-neutral3 focus:outline-none focus:ring-1 focus:ring-accent1"
        />
        <Button variant="default" size="sm" onClick={handleAdd} disabled={!input.trim()}>
          <Plus className="size-4" />
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: 创建最近报告面板组件**

```typescript
// apps/desktop/src/renderer/domains/dashboard/components/recent-reports-panel.tsx
import { Button } from '@mastra/playground-ui/components/Button';
import { ArrowRight } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useLinkComponent } from '@/lib/framework';
import { cn } from '@/lib/utils';

const actionConfig: Record<string, { color: string; bg: string }> = {
  BUY: { color: 'text-emerald-400', bg: 'bg-emerald-400/10' },
  SELL: { color: 'text-rose-400', bg: 'bg-rose-400/10' },
  HOLD: { color: 'text-amber-400', bg: 'bg-amber-400/10' },
  WATCH: { color: 'text-sky-400', bg: 'bg-sky-400/10' },
};

export function RecentReportsPanel() {
  const { paths } = useLinkComponent();

  const { data, isLoading } = useQuery({
    queryKey: ['recent-reports', 5],
    queryFn: async () => {
      const res = await fetch('/api/research/reports?limit=5');
      if (!res.ok) throw new Error('Failed to fetch reports');
      return res.json() as Promise<{ reports: any[]; total: number }>;
    },
  });

  const reports = data?.reports ?? [];

  return (
    <div className="rounded-lg border border-border1 bg-surface3/75 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-neutral6">最近报告</h3>
        <Button variant="ghost" size="sm" href={paths.agentsLink()}>
          查看全部
          <ArrowRight className="size-3" />
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-10 animate-pulse rounded bg-surface4" />
          ))}
        </div>
      ) : reports.length === 0 ? (
        <div className="py-6 text-center text-xs text-neutral3">
          暂无投研报告
        </div>
      ) : (
        <div className="space-y-1">
          {reports.map((report: any) => {
            const action = actionConfig[report.action] ?? actionConfig.HOLD;
            return (
              <div
                key={report.id}
                className="group flex items-center justify-between rounded-md px-2 py-1.5 hover:bg-surface4/60 cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm font-medium text-neutral6">{report.symbol}</span>
                  <span className="text-xs text-neutral3">{report.pattern ?? 'council'}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-neutral3">
                    {new Date(report.date).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })}
                  </span>
                  <span className={cn('rounded px-1.5 py-0.5 text-[11px] font-medium', action.bg, action.color)}>
                    {report.action}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: 实现完整 Dashboard 页面**

```typescript
// apps/desktop/src/renderer/pages/dashboard/index.tsx — 完整替换
import { PageLayout } from '@mastra/playground-ui/components/PageLayout';
import { Zap } from 'lucide-react';
import { useNavigate } from 'react-router';
import { WatchlistPanel } from '@/domains/dashboard/components/watchlist-panel';
import { RecentReportsPanel } from '@/domains/dashboard/components/recent-reports-panel';
import { useWatchlist } from '@/hooks/use-watchlist';

export function DashboardPage() {
  const { watchlist, addSymbol, removeSymbol } = useWatchlist();
  const navigate = useNavigate();

  const handleQuickResearch = (symbol: string) => {
    // 跳转到协同投研页，预填标的
    navigate(`/collaboration?symbol=${encodeURIComponent(symbol)}`);
  };

  return (
    <PageLayout>
      <PageLayout.TopArea className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-neutral6">投研看板</h1>
          <p className="mt-1 text-sm text-neutral3">自选股、最近报告、跟踪条件一览</p>
        </div>
        <button
          onClick={() => navigate('/collaboration')}
          className="flex items-center gap-2 rounded-lg bg-accent1 px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
        >
          <Zap className="size-4" />
          快速投研
        </button>
      </PageLayout.TopArea>

      <PageLayout.MainArea>
        <div className="grid gap-4 p-5 lg:p-6 xl:grid-cols-2">
          <WatchlistPanel
            symbols={watchlist.map(w => w.symbol)}
            onAdd={addSymbol}
            onRemove={removeSymbol}
            onQuickResearch={handleQuickResearch}
          />
          <RecentReportsPanel />
        </div>

        {/* 投研团队概览 */}
        <div className="px-5 pb-5 lg:px-6 lg:pb-6">
          <div className="rounded-lg border border-border1 bg-surface3/75 p-4">
            <h3 className="mb-3 text-sm font-semibold text-neutral6">投研团队</h3>
            <p className="text-xs text-neutral3">
              在「投研角色」页面管理你的分析团队，在「协同投研」页面组织团队协作。
            </p>
          </div>
        </div>
      </PageLayout.MainArea>
    </PageLayout>
  );
}

export default DashboardPage;
```

- [ ] **Step 5: 验证编译 + 运行**

```bash
cd /Users/wenjunjie/Documents/antigravity/jolly-curie/apps/desktop && npx tsc --noEmit 2>&1 | head -20
```

启动应用确认 Dashboard 页面渲染：自选股可添加/删除、最近报告从 API 加载。

- [ ] **Step 6: Commit**

```bash
cd /Users/wenjunjie/Documents/antigravity/jolly-curie
git add apps/desktop/src/renderer/domains/dashboard/ apps/desktop/src/renderer/hooks/use-watchlist.ts apps/desktop/src/renderer/pages/dashboard/
git commit -m "feat(desktop): implement investment research dashboard with watchlist and recent reports"
```

---

## Task 3: 投研报告中心（Reports）

**Files:**
- Create: `apps/desktop/src/renderer/domains/reports/components/report-list.tsx`
- Create: `apps/desktop/src/renderer/domains/reports/components/report-detail-view.tsx`
- Create: `apps/desktop/src/renderer/domains/reports/components/report-opinion-card.tsx`
- Create: `apps/desktop/src/renderer/pages/reports/index.tsx`
- Create: `apps/desktop/src/renderer/pages/reports/report.tsx`
- Create: `apps/desktop/src/renderer/hooks/use-reports.ts`
- Modify: `apps/desktop/src/renderer/App.tsx`

**Interfaces:**
- Consumes: `GET /api/research/reports` (list), `GET /api/research/reports/:id` (detail), `DELETE /api/research/reports/:id`; `ResearchReport`, `AgentOpinion`, `RiskItem`, `TrackingCondition` types from `@trading-agent/shared`
- Produces: `/reports` list page, `/reports/:id` detail page

- [ ] **Step 1: 创建 reports hook**

```typescript
// apps/desktop/src/renderer/hooks/use-reports.ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ResearchReport } from '@trading-agent/shared';

export function useReports(params?: { symbol?: string; action?: string; limit?: number; offset?: number }) {
  const searchParams = new URLSearchParams();
  if (params?.symbol) searchParams.set('symbol', params.symbol);
  if (params?.action) searchParams.set('action', params.action);
  searchParams.set('limit', String(params?.limit ?? 20));
  searchParams.set('offset', String(params?.offset ?? 0));

  return useQuery({
    queryKey: ['reports', params],
    queryFn: async () => {
      const res = await fetch(`/api/research/reports?${searchParams}`);
      if (!res.ok) throw new Error('Failed to fetch reports');
      return res.json() as Promise<{ reports: ResearchReport[]; total: number }>;
    },
  });
}

export function useReport(id: string | undefined) {
  return useQuery({
    queryKey: ['report', id],
    queryFn: async () => {
      if (!id) throw new Error('Report ID required');
      const res = await fetch(`/api/research/reports/${id}`);
      if (!res.ok) throw new Error('Failed to fetch report');
      return res.json() as Promise<ResearchReport>;
    },
    enabled: !!id,
  });
}

export function useDeleteReport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/research/reports/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete report');
      return res.json();
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['reports'] });
    },
  });
}
```

- [ ] **Step 2: 创建角色观点卡片组件**

```typescript
// apps/desktop/src/renderer/domains/reports/components/report-opinion-card.tsx
import type { AgentOpinion } from '@trading-agent/shared';
import { cn } from '@/lib/utils';

const signalConfig: Record<string, string> = {
  BUY: 'text-emerald-400 bg-emerald-400/10',
  SELL: 'text-rose-400 bg-rose-400/10',
  HOLD: 'text-amber-400 bg-amber-400/10',
  WATCH: 'text-sky-400 bg-sky-400/10',
};

export function ReportOpinionCard({ opinion }: { opinion: AgentOpinion }) {
  const signalClass = opinion.signal ? signalConfig[opinion.signal] : '';
  const confidencePct = opinion.confidence != null ? Math.round(opinion.confidence * 100) : null;

  return (
    <div className="rounded-lg border border-border1 bg-surface2/60 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 className="text-sm font-semibold text-neutral6">{opinion.role}</h4>
          {opinion.signal && (
            <span className={cn('mt-1 inline-block rounded px-1.5 py-0.5 text-[11px] font-medium', signalClass)}>
              {opinion.signal}
            </span>
          )}
        </div>
        {confidencePct != null && (
          <span className="shrink-0 font-mono text-xs text-neutral3">{confidencePct}%</span>
        )}
      </div>
      <p className="mt-2 text-sm font-medium text-neutral5">{opinion.summary}</p>
      <p className="mt-1 text-xs leading-5 text-neutral3">{opinion.details}</p>
    </div>
  );
}
```

- [ ] **Step 3: 创建报告列表组件**

```typescript
// apps/desktop/src/renderer/domains/reports/components/report-list.tsx
import { Button } from '@mastra/playground-ui/components/Button';
import { Trash2, ArrowRight } from 'lucide-react';
import { useState } from 'react';
import { useDeleteReport, useReports } from '@/hooks/use-reports';
import { useLinkComponent } from '@/lib/framework';
import { cn } from '@/lib/utils';

const actionConfig: Record<string, { color: string; bg: string; label: string }> = {
  BUY: { color: 'text-emerald-400', bg: 'bg-emerald-400/10', label: 'BUY' },
  SELL: { color: 'text-rose-400', bg: 'bg-rose-400/10', label: 'SELL' },
  HOLD: { color: 'text-amber-400', bg: 'bg-amber-400/10', label: 'HOLD' },
  WATCH: { color: 'text-sky-400', bg: 'bg-sky-400/10', label: 'WATCH' },
};

export function ReportList({ symbolFilter }: { symbolFilter?: string }) {
  const { data, isLoading } = useReports({ symbol: symbolFilter, limit: 50 });
  const deleteMutation = useDeleteReport();
  const { paths } = useLinkComponent();
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-lg bg-surface4" />
        ))}
      </div>
    );
  }

  const reports = data?.reports ?? [];

  if (reports.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border1 bg-surface3/40 px-5 py-12 text-center">
        <p className="text-sm font-medium text-neutral6">暂无投研报告</p>
        <p className="mt-1 text-xs text-neutral3">在协同投研页面执行一次分析即可生成报告</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {reports.map(report => {
        const action = actionConfig[report.action] ?? actionConfig.HOLD;
        return (
          <div
            key={report.id}
            className="group rounded-lg border border-border1 bg-surface3/75 p-4 transition-colors hover:border-neutral3"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-base font-semibold text-neutral6">{report.symbol}</span>
                  <span className="text-xs text-neutral3">{report.pattern ?? 'council'} 模式</span>
                  <span className="text-xs text-neutral3">
                    {new Date(report.date).toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <p className="mt-2 line-clamp-2 text-sm text-neutral4">{report.conclusion}</p>
                <div className="mt-3 flex items-center gap-3 text-xs">
                  <span className="font-mono text-neutral4">${report.price.toFixed(2)}</span>
                  <span className={cn('rounded px-2 py-0.5 text-[11px] font-medium', action.bg, action.color)}>
                    {action.label}
                  </span>
                  <span className="text-neutral3">信心度 {Math.round(report.confidence * 100)}%</span>
                  <span className="text-neutral3">{report.opinions.length} 个观点</span>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1.5 opacity-0 transition-opacity group-hover:opacity-100">
                <Button
                  variant="ghost"
                  size="sm"
                  href={`/reports/${report.id}`}
                >
                  详情
                  <ArrowRight className="size-3" />
                </Button>
                {confirmDelete === report.id ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-rose-400"
                    onClick={() => {
                      void deleteMutation.mutateAsync(report.id!);
                      setConfirmDelete(null);
                    }}
                  >
                    确认删除
                  </Button>
                ) : (
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => setConfirmDelete(report.id!)}
                    className="text-neutral3 hover:text-rose-400"
                  >
                    <Trash2 className="size-3" />
                  </Button>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: 创建报告详情视图组件**

```typescript
// apps/desktop/src/renderer/domains/reports/components/report-detail-view.tsx
import { Button } from '@mastra/playground-ui/components/Button';
import { ArrowLeft, Download } from 'lucide-react';
import type { ResearchReport, RiskItem, TrackingCondition } from '@trading-agent/shared';
import { ReportOpinionCard } from './report-opinion-card';
import { cn } from '@/lib/utils';

const actionConfig: Record<string, { color: string; bg: string }> = {
  BUY: { color: 'text-emerald-400', bg: 'bg-emerald-400/10' },
  SELL: { color: 'text-rose-400', bg: 'bg-rose-400/10' },
  HOLD: { color: 'text-amber-400', bg: 'bg-amber-400/10' },
  WATCH: { color: 'text-sky-400', bg: 'bg-sky-400/10' },
};

const severityConfig: Record<string, string> = {
  high: 'text-rose-400',
  medium: 'text-amber-400',
  low: 'text-sky-400',
};

function ConfidenceBar({ confidence }: { confidence: number }) {
  const pct = Math.round(confidence * 100);
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-32 overflow-hidden rounded-full bg-surface5">
        <div
          className="h-full rounded-full bg-accent1 transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="font-mono text-xs text-neutral3">{pct}%</span>
    </div>
  );
}

function exportMarkdown(report: ResearchReport) {
  const lines = [
    `# ${report.title}`,
    ``,
    `- 标的: ${report.symbol}`,
    `- 日期: ${report.date}`,
    `- 价格: $${report.price.toFixed(2)}`,
    `- 建议: ${report.action}`,
    `- 信心度: ${Math.round(report.confidence * 100)}%`,
    `- 协作模式: ${report.pattern ?? 'council'}`,
    ``,
    `## 综合结论`,
    ``,
    report.conclusion,
    ``,
    `## 各角色观点`,
    ``,
    ...report.opinions.map(o => `### ${o.role}\n\n**倾向**: ${o.signal ?? '未明确'}\n**信心度**: ${o.confidence != null ? Math.round(o.confidence * 100) + '%' : '未明确'}\n\n${o.summary}\n\n${o.details}\n`),
    `## 风险清单`,
    ``,
    ...report.risks.map(r => `- **[${r.severity.toUpperCase()}] ${r.category}**: ${r.description}`),
    ``,
    `## 跟踪条件`,
    ``,
    ...report.trackingConditions.map(t => `- **${t.metric}**: ${t.threshold} → ${t.action}`),
  ];

  const blob = new Blob([lines.join('\n')], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${report.symbol}-${report.date}.md`;
  a.click();
  URL.revokeObjectURL(url);
}

interface ReportDetailViewProps {
  report: ResearchReport;
  onBack: () => void;
}

export function ReportDetailView({ report, onBack }: ReportDetailViewProps) {
  const action = actionConfig[report.action] ?? actionConfig.HOLD;

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      {/* Header */}
      <div className="sticky top-0 z-10 border-b border-border1 bg-surface1/95 px-5 py-3 backdrop-blur lg:px-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon-sm" onClick={onBack}>
              <ArrowLeft className="size-4" />
            </Button>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-mono text-lg font-semibold text-neutral6">{report.symbol}</h1>
                <span className={cn('rounded px-2 py-0.5 text-xs font-medium', action.bg, action.color)}>
                  {report.action}
                </span>
              </div>
              <p className="text-xs text-neutral3">
                {report.pattern ?? 'council'} 模式 · {new Date(report.date).toLocaleString('zh-CN')} · ${report.price.toFixed(2)}
              </p>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={() => exportMarkdown(report)}>
            <Download className="size-3" />
            导出 Markdown
          </Button>
        </div>
      </div>

      <div className="space-y-4 p-5 lg:p-6">
        {/* 综合研判 */}
        <section className="rounded-lg border border-border1 bg-surface3/75 p-4">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-neutral6">综合研判</h2>
            <ConfidenceBar confidence={report.confidence} />
          </div>
          <p className="text-sm leading-6 text-neutral4">{report.conclusion}</p>
        </section>

        {/* 各角色观点 */}
        <section>
          <h2 className="mb-2 text-sm font-semibold text-neutral6">各角色观点 ({report.opinions.length})</h2>
          <div className="grid gap-3">
            {report.opinions.map((opinion, i) => (
              <ReportOpinionCard key={i} opinion={opinion} />
            ))}
          </div>
        </section>

        {/* 风险清单 */}
        {report.risks.length > 0 && (
          <section>
            <h2 className="mb-2 text-sm font-semibold text-neutral6">风险清单 ({report.risks.length})</h2>
            <div className="space-y-1.5">
              {report.risks.map((risk: RiskItem, i: number) => (
                <div key={i} className="flex items-center gap-3 rounded-md border border-border1 bg-surface2/60 px-3 py-2">
                  <span className={cn('shrink-0 text-xs font-mono font-semibold', severityConfig[risk.severity])}>
                    {risk.severity.toUpperCase()}
                  </span>
                  <span className="shrink-0 text-xs text-neutral3">{risk.category}</span>
                  <span className="min-w-0 truncate text-sm text-neutral4">{risk.description}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* 跟踪条件 */}
        {report.trackingConditions.length > 0 && (
          <section>
            <h2 className="mb-2 text-sm font-semibold text-neutral6">跟踪条件 ({report.trackingConditions.length})</h2>
            <div className="space-y-1.5">
              {report.trackingConditions.map((cond: TrackingCondition, i: number) => (
                <div key={i} className="flex items-center gap-3 rounded-md border border-border1 bg-surface2/60 px-3 py-2">
                  <span className="shrink-0 font-mono text-sm font-medium text-neutral5">{cond.metric}</span>
                  <span className="shrink-0 text-sm text-neutral4">{cond.threshold}</span>
                  <span className="text-xs text-neutral3">→</span>
                  <span className="min-w-0 text-sm text-neutral3">{cond.action}</span>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: 创建报告列表页和详情页**

```typescript
// apps/desktop/src/renderer/pages/reports/index.tsx
import { PageLayout } from '@mastra/playground-ui/components/PageLayout';
import { useState } from 'react';
import { ReportList } from '@/domains/reports/components/report-list';

export function ReportsPage() {
  const [symbol, setSymbol] = useState('');

  return (
    <PageLayout>
      <PageLayout.TopArea>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-neutral6">投研报告</h1>
            <p className="mt-1 text-sm text-neutral3">历史投研报告列表，支持按标的筛选</p>
          </div>
          <input
            value={symbol}
            onChange={e => setSymbol(e.target.value.toUpperCase())}
            placeholder="按标的筛选"
            className="rounded-md border border-border1 bg-surface2 px-3 py-1.5 text-sm text-neutral6 placeholder:text-neutral3 focus:outline-none focus:ring-1 focus:ring-accent1"
          />
        </div>
      </PageLayout.TopArea>
      <PageLayout.MainArea>
        <div className="p-5 lg:p-6">
          <ReportList symbolFilter={symbol || undefined} />
        </div>
      </PageLayout.MainArea>
    </PageLayout>
  );
}

export default ReportsPage;
```

```typescript
// apps/desktop/src/renderer/pages/reports/report.tsx
import { useParams, useNavigate } from 'react-router';
import { ReportDetailView } from '@/domains/reports/components/report-detail-view';
import { useReport } from '@/hooks/use-reports';

export function ReportDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: report, isLoading, error } = useReport(id);

  if (isLoading) {
    return <div className="flex h-full items-center justify-center text-sm text-neutral3">加载报告中...</div>;
  }

  if (error || !report) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3">
        <p className="text-sm text-neutral4">{error ? '报告加载失败' : '报告不存在'}</p>
        <button onClick={() => navigate('/reports')} className="text-sm text-accent1 hover:underline">
          返回列表
        </button>
      </div>
    );
  }

  return <ReportDetailView report={report} onBack={() => navigate('/reports')} />;
}

export default ReportDetailPage;
```

- [ ] **Step 6: 在 `App.tsx` 中注册报告路由**

在 `routes` 数组 RootLayout children 中添加：

```typescript
// import 区
import ReportsPage from '@/pages/reports';
import ReportDetailPage from '@/pages/reports/report';

// routes 数组中，在 /dashboard 之后添加：
{ path: '/reports', element: <ReportsPage />, handle: navHandle('/reports') },
{ path: '/reports/:id', element: <ReportDetailPage />, handle: navHandleWithChildren('/reports', [{ id: 'report', label: '报告详情' }]) },
```

- [ ] **Step 7: 验证编译 + 运行**

```bash
cd /Users/wenjunjie/Documents/antigravity/jolly-curie/apps/desktop && npx tsc --noEmit 2>&1 | head -20
```

启动应用，导航到「报告中心」，确认：列表页加载、详情页结构化展示、导出 Markdown 功能正常。

- [ ] **Step 8: Commit**

```bash
cd /Users/wenjunjie/Documents/antigravity/jolly-curie
git add apps/desktop/src/renderer/domains/reports/ apps/desktop/src/renderer/hooks/use-reports.ts apps/desktop/src/renderer/pages/reports/ apps/desktop/src/renderer/App.tsx
git commit -m "feat(desktop): implement research report center with list, detail, and markdown export"
```

---

## Task 4: 协同投研编排器（Collaboration Orchestrator）

**Files:**
- Create: `apps/desktop/src/renderer/domains/collaboration/components/pattern-selector.tsx`
- Create: `apps/desktop/src/renderer/domains/collaboration/components/agent-team-picker.tsx`
- Create: `apps/desktop/src/renderer/domains/collaboration/components/collaboration-progress.tsx`
- Create: `apps/desktop/src/renderer/pages/collaboration/index.tsx`
- Create: `apps/desktop/src/renderer/hooks/use-collaboration.ts`
- Modify: `apps/desktop/src/renderer/App.tsx`

**Interfaces:**
- Consumes: `POST /api/research/collaboration/execute` (Task 0 API), `GET /api/research/agents` (agent configs for picker), `CollaborationPattern` type from `@trading-agent/shared`
- Produces: `/collaboration` page with pattern selector, agent team picker, execute button, and result display

- [ ] **Step 1: 创建 collaboration hook**

```typescript
// apps/desktop/src/renderer/hooks/use-collaboration.ts
import { useMutation, useQuery } from '@tanstack/react-query';
import type { CollaborationPattern, ResearchReport } from '@trading-agent/shared';

interface ExecuteInput {
  symbol: string;
  pattern: CollaborationPattern;
  participantAgentIds: string[];
  supervisorAgentId?: string;
}

export function useAgentConfigs() {
  return useQuery({
    queryKey: ['agent-configs'],
    queryFn: async () => {
      const res = await fetch('/api/research/agents');
      if (!res.ok) throw new Error('Failed to fetch agent configs');
      return res.json() as Promise<Array<{ id: string; name: string; metadata?: { role?: string } }>>;
    },
  });
}

export function useExecuteCollaboration() {
  return useMutation({
    mutationFn: async (input: ExecuteInput) => {
      const res = await fetch('/api/research/collaboration/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Execution failed' }));
        throw new Error(err.error || 'Execution failed');
      }
      return res.json() as Promise<ResearchReport>;
    },
  });
}
```

- [ ] **Step 2: 创建协作模式选择器**

```typescript
// apps/desktop/src/renderer/domains/collaboration/components/pattern-selector.tsx
import type { CollaborationPattern } from '@trading-agent/shared';
import { Users, GitBranch, Swords, Network, Scan } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PatternOption {
  value: CollaborationPattern;
  label: string;
  description: string;
  Icon: typeof Users;
}

const patterns: PatternOption[] = [
  { value: 'council', label: '圆桌会议', description: 'N 个 Agent 并行分析，Supervisor 汇总', Icon: Users },
  { value: 'pipeline', label: '流水线', description: 'Agent 串行分析，上游输出传递给下游', Icon: GitBranch },
  { value: 'debate', label: '多空辩论', description: '多空两方对抗，Supervisor 裁决', Icon: Swords },
  { value: 'hierarchical', label: '层级委派', description: 'Supervisor 动态拆解任务并委派', Icon: Network },
  { value: 'parallel-scan', label: '并行扫描', description: 'N 个 Agent 分别扫描不同标的', Icon: Scan },
];

interface PatternSelectorProps {
  value: CollaborationPattern;
  onChange: (pattern: CollaborationPattern) => void;
}

export function PatternSelector({ value, onChange }: PatternSelectorProps) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
      {patterns.map(p => {
        const active = p.value === value;
        return (
          <button
            key={p.value}
            type="button"
            onClick={() => onChange(p.value)}
            className={cn(
              'flex flex-col items-center gap-2 rounded-lg border p-3 text-center transition-all',
              active
                ? 'border-accent1 bg-accent1/10 text-neutral6'
                : 'border-border1 bg-surface3/60 text-neutral4 hover:border-neutral3 hover:bg-surface4/60',
            )}
          >
            <p.Icon className={cn('size-5', active && 'text-accent1')} />
            <div>
              <div className="text-xs font-semibold">{p.label}</div>
              <div className="mt-0.5 text-[10px] leading-tight text-neutral3">{p.description}</div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 3: 创建 Agent 团队选择器**

```typescript
// apps/desktop/src/renderer/domains/collaboration/components/agent-team-picker.tsx
import { Check, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AgentTeamPickerProps {
  availableAgents: Array<{ id: string; name: string; metadata?: { role?: string } }>;
  selectedIds: string[];
  supervisorId: string | undefined;
  onToggle: (id: string) => void;
  onSetSupervisor: (id: string | undefined) => void;
}

export function AgentTeamPicker({
  availableAgents,
  selectedIds,
  supervisorId,
  onToggle,
  onSetSupervisor,
}: AgentTeamPickerProps) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {/* 可用列表 */}
      <div className="rounded-lg border border-border1 bg-surface3/60 p-3">
        <h4 className="mb-2 text-xs font-semibold uppercase text-neutral3">可选角色 ({availableAgents.length})</h4>
        <div className="space-y-1">
          {availableAgents.map(agent => {
            const isSelected = selectedIds.includes(agent.id);
            return (
              <button
                key={agent.id}
                type="button"
                onClick={() => onToggle(agent.id)}
                className={cn(
                  'flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left transition-colors',
                  isSelected ? 'bg-surface4/60 opacity-50' : 'hover:bg-surface4/40',
                )}
              >
                <div className="min-w-0">
                  <div className="truncate text-sm text-neutral6">{agent.name}</div>
                  <div className="truncate text-xs text-neutral3">{agent.metadata?.role ?? agent.id}</div>
                </div>
                {!isSelected && <ChevronRight className="size-3 shrink-0 text-neutral3" />}
              </button>
            );
          })}
        </div>
      </div>

      {/* 已选列表 + Supervisor */}
      <div className="rounded-lg border border-border1 bg-surface3/60 p-3">
        <h4 className="mb-2 text-xs font-semibold uppercase text-neutral3">
          已选角色 ({selectedIds.length})
        </h4>
        <div className="space-y-1">
          {selectedIds.length === 0 ? (
            <p className="py-4 text-center text-xs text-neutral3">从左侧选择角色加入</p>
          ) : (
            selectedAgents.map(id => {
              const agent = availableAgents.find(a => a.id === id);
              const isSupervisor = supervisorId === id;
              return (
                <div
                  key={id}
                  className="group flex items-center justify-between rounded-md bg-surface4/40 px-2 py-1.5"
                >
                  <div className="flex items-center gap-2">
                    <Check className="size-3 text-emerald-400" />
                    <div className="min-w-0">
                      <div className="truncate text-sm text-neutral6">{agent?.name ?? id}</div>
                      <div className="truncate text-xs text-neutral3">{agent?.metadata?.role ?? id}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => onSetSupervisor(isSupervisor ? undefined : id)}
                      className={cn(
                        'rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors',
                        isSupervisor
                          ? 'bg-violet-400/20 text-violet-300'
                          : 'text-neutral3 hover:text-violet-300',
                      )}
                    >
                      {isSupervisor ? '★ Supervisor' : '设为 Supervisor'}
                    </button>
                    <button
                      type="button"
                      onClick={() => onToggle(id)}
                      className="text-neutral3 hover:text-rose-400"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              );
              function selectedAgents() {}
            })
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: 创建执行进度组件**

```typescript
// apps/desktop/src/renderer/domains/collaboration/components/collaboration-progress.tsx
import { Spinner } from '@mastra/playground-ui/components/Spinner';
import { Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import type { ResearchReport } from '@trading-agent/shared';
import { ReportDetailView } from '@/domains/reports/components/report-detail-view';

const selectedAgents = (ids: string[]) => ids;
void selectedAgents;

interface CollaborationProgressProps {
  status: 'idle' | 'executing' | 'success' | 'error';
  error?: string;
  report?: ResearchReport;
  symbol: string;
  pattern: string;
  onBack: () => void;
}

export function CollaborationProgress({
  status,
  error,
  report,
  symbol,
  pattern,
  onBack,
}: CollaborationProgressProps) {
  if (status === 'idle') return null;

  if (status === 'executing') {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4">
        <Loader2 className="size-8 animate-spin text-accent1" />
        <div className="text-center">
          <p className="text-sm font-medium text-neutral6">正在分析 {symbol}</p>
          <p className="text-xs text-neutral3">{pattern} 模式 · 多个 Agent 协作中...</p>
        </div>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3">
        <AlertCircle className="size-8 text-rose-400" />
        <div className="text-center">
          <p className="text-sm font-medium text-neutral6">投研执行失败</p>
          <p className="mt-1 text-xs text-neutral3">{error ?? '未知错误'}</p>
        </div>
        <button onClick={onBack} className="mt-2 text-sm text-accent1 hover:underline">
          返回重新配置
        </button>
      </div>
    );
  }

  if (status === 'success' && report) {
    return <ReportDetailView report={report} onBack={onBack} />;
  }

  return null;
}
```

- [ ] **Step 5: 创建协同投研页面**

```typescript
// apps/desktop/src/renderer/pages/collaboration/index.tsx
import { Button } from '@mastra/playground-ui/components/Button';
import { Zap } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import type { CollaborationPattern } from '@trading-agent/shared';
import { PatternSelector } from '@/domains/collaboration/components/pattern-selector';
import { AgentTeamPicker } from '@/domains/collaboration/components/agent-team-picker';
import { CollaborationProgress } from '@/domains/collaboration/components/collaboration-progress';
import { useAgentConfigs, useExecuteCollaboration } from '@/hooks/use-collaboration';

export function CollaborationPage() {
  const [searchParams] = useSearchParams();
  const [symbol, setSymbol] = useState(searchParams.get('symbol') ?? 'AAPL');
  const [pattern, setPattern] = useState<CollaborationPattern>('council');
  const [selectedIds, setSelectedIds] = useState<string[]>([
    'trading-agent',
    'market-analysis-agent',
    'sentiment-analysis-agent',
    'risk-analysis-agent',
  ]);
  const [supervisorId, setSupervisorId] = useState<string | undefined>('research-supervisor');

  const { data: agents } = useAgentConfigs();
  const mutation = useExecuteCollaboration();

  useEffect(() => {
    const s = searchParams.get('symbol');
    if (s) setSymbol(s.toUpperCase());
  }, [searchParams]);

  const handleToggle = (id: string) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id],
    );
    if (supervisorId === id) setSupervisorId(undefined);
  };

  const handleExecute = () => {
    if (!symbol.trim() || selectedIds.length === 0) return;
    void mutation.mutateAsync({
      symbol: symbol.trim().toUpperCase(),
      pattern,
      participantAgentIds: selectedIds,
      supervisorAgentId: supervisorId,
    });
  };

  // 执行中/完成后显示进度/结果
  if (mutation.isPending || mutation.isSuccess || mutation.isError) {
    const status = mutation.isPending
      ? 'executing' as const
      : mutation.isError
        ? 'error' as const
        : 'success' as const;

    return (
      <div className="h-full">
        <CollaborationProgress
          status={status}
          error={mutation.error?.message}
          report={mutation.data}
          symbol={symbol}
          pattern={pattern}
          onBack={() => mutation.reset()}
        />
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-5 lg:p-6">
      <div className="mx-auto max-w-3xl space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-neutral6">协同投研</h1>
          <p className="mt-1 text-sm text-neutral3">选择标的、协作模式和 Agent 团队，一键执行多角色投研分析</p>
        </div>

        {/* 标的输入 */}
        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase text-neutral3">分析标的</label>
          <input
            value={symbol}
            onChange={e => setSymbol(e.target.value.toUpperCase())}
            placeholder="如 AAPL, TSLA, NVDA"
            className="w-full rounded-lg border border-border1 bg-surface2 px-3 py-2 font-mono text-sm text-neutral6 placeholder:text-neutral3 focus:outline-none focus:ring-1 focus:ring-accent1"
          />
        </div>

        {/* 协作模式 */}
        <div>
          <label className="mb-2 block text-xs font-semibold uppercase text-neutral3">协作模式</label>
          <PatternSelector value={pattern} onChange={setPattern} />
        </div>

        {/* Agent 团队 */}
        <div>
          <label className="mb-2 block text-xs font-semibold uppercase text-neutral3">参与角色</label>
          <AgentTeamPicker
            availableAgents={agents ?? []}
            selectedIds={selectedIds}
            supervisorId={supervisorId}
            onToggle={handleToggle}
            onSetSupervisor={setSupervisorId}
          />
        </div>

        {/* 执行按钮 */}
        <div className="flex justify-end gap-3">
          <Button
            variant="default"
            size="lg"
            onClick={handleExecute}
            disabled={!symbol.trim() || selectedIds.length === 0}
          >
            <Zap className="size-4" />
            开始投研
          </Button>
        </div>
      </div>
    </div>
  );
}

export default CollaborationPage;
```

- [ ] **Step 6: 在 `App.tsx` 中注册协同投研路由**

```typescript
// import 区
import CollaborationPage from '@/pages/collaboration';

// routes 数组中添加：
{ path: '/collaboration', element: <CollaborationPage />, handle: navHandle('/collaboration') },
```

- [ ] **Step 7: 验证编译 + 运行**

```bash
cd /Users/wenjunjie/Documents/antigravity/jolly-curie/apps/desktop && npx tsc --noEmit 2>&1 | head -20
```

启动应用，导航到「协同投研」，确认：模式选择器切换、Agent 穿梭框、输入标的、执行后显示加载→结果报告。

- [ ] **Step 8: Commit**

```bash
cd /Users/wenjunjie/Documents/antigravity/jolly-curie
git add apps/desktop/src/renderer/domains/collaboration/ apps/desktop/src/renderer/hooks/use-collaboration.ts apps/desktop/src/renderer/pages/collaboration/ apps/desktop/src/renderer/App.tsx
git commit -m "feat(desktop): implement collaboration orchestrator with pattern selector, agent picker, and execution"
```

---

## Task 5: 行情可视化（K 线 + 指标 + 情绪 + 基本面）

**Files:**
- Modify: `apps/desktop/package.json` (add `lightweight-charts` dependency)
- Create: `apps/desktop/src/renderer/domains/market/components/kline-chart.tsx`
- Create: `apps/desktop/src/renderer/domains/market/components/indicators-panel.tsx`
- Create: `apps/desktop/src/renderer/domains/market/components/market-data-card.tsx`
- Create: `apps/desktop/src/renderer/hooks/use-market-data.ts`
- Modify: `apps/desktop/src/renderer/pages/dashboard/index.tsx` (integrate real prices into watchlist)

**Interfaces:**
- Consumes: `GET /api/research/market/:symbol` (Task 0 API), `KLineData`, `Indicators` types from `@trading-agent/shared`
- Produces: K-line chart component, indicators panel, market data hook for watchlist price updates

- [ ] **Step 1: 安装 lightweight-charts**

```bash
cd /Users/wenjunjie/Documents/antigravity/jolly-curie/apps/desktop && npm install lightweight-charts@^4.2.0
```

- [ ] **Step 2: 创建行情数据 hook**

```typescript
// apps/desktop/src/renderer/hooks/use-market-data.ts
import { useQuery } from '@tanstack/react-query';
import type { Indicators, KLineData } from '@trading-agent/shared';

interface MarketDataResponse {
  symbol: string;
  latestPrice: number;
  klines: KLineData[];
  dataPoints: number;
  indicators: Indicators;
}

export function useMarketData(symbol: string | undefined, period: '1mo' | '3mo' | '6mo' | '1y' = '3mo') {
  return useQuery({
    queryKey: ['market-data', symbol, period],
    queryFn: async () => {
      if (!symbol) throw new Error('Symbol required');
      const res = await fetch(`/api/research/market/${encodeURIComponent(symbol)}?period=${period}`);
      if (!res.ok) throw new Error('Failed to fetch market data');
      return res.json() as Promise<MarketDataResponse>;
    },
    enabled: !!symbol,
    refetchInterval: 60_000, // 每分钟刷新
  });
}

/** 轻量版：只取最新价格，用于自选股面板 */
export function useWatchlistPrices(symbols: string[]) {
  return useQuery({
    queryKey: ['watchlist-prices', symbols],
    queryFn: async () => {
      const results = await Promise.all(
        symbols.map(async symbol => {
          try {
            const res = await fetch(`/api/research/market/${encodeURIComponent(symbol)}?period=1mo`);
            if (!res.ok) return { symbol, price: undefined, changePct: undefined };
            const data = await res.json();
            const klines = data.klines as KLineData[];
            if (klines.length < 2) return { symbol, price: data.latestPrice, changePct: undefined };
            const last = klines[klines.length - 1].close;
            const prev = klines[klines.length - 2].close;
            return {
              symbol,
              price: last,
              changePct: prev > 0 ? ((last - prev) / prev) * 100 : 0,
            };
          } catch {
            return { symbol, price: undefined, changePct: undefined };
          }
        }),
      );
      return results;
    },
    enabled: symbols.length > 0,
    refetchInterval: 60_000,
  });
}
```

- [ ] **Step 3: 创建 K 线图表组件**

```typescript
// apps/desktop/src/renderer/domains/market/components/kline-chart.tsx
import { createChart, ColorType, CandlestickSeries } from 'lightweight-charts';
import type { IChartApi } from 'lightweight-charts';
import { useEffect, useRef } from 'react';
import type { KLineData } from '@trading-agent/shared';

interface KLineChartProps {
  klines: KLineData[];
  height?: number;
}

export function KLineChart({ klines, height = 300 }: KLineChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      height,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#a1a1aa',
        fontSize: 11,
      },
      grid: {
        vertLines: { color: 'rgba(63, 63, 70, 0.3)' },
        horzLines: { color: 'rgba(63, 63, 70, 0.3)' },
      },
      rightPriceScale: {
        borderColor: 'rgba(63, 63, 70, 0.5)',
      },
      timeScale: {
        borderColor: 'rgba(63, 63, 70, 0.5)',
      },
      crosshair: {
        mode: 0,
      },
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#34d399',
      downColor: '#fb7185',
      borderUpColor: '#34d399',
      borderDownColor: '#fb7185',
      wickUpColor: '#34d399',
      wickDownColor: '#fb7185',
    });

    const data = klines.map(k => ({
      time: k.time as any,
      open: k.open,
      high: k.high,
      low: k.low,
      close: k.close,
    }));

    candleSeries.setData(data);
    chart.timeScale().fitContent();

    chartRef.current = chart;

    const handleResize = () => {
      if (containerRef.current && chartRef.current) {
        chartRef.current.applyOptions({ width: containerRef.current.clientWidth });
      }
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
      chartRef.current = null;
    };
  }, [klines, height]);

  return <div ref={containerRef} className="w-full" style={{ height }} />;
}
```

- [ ] **Step 4: 创建技术指标面板组件**

```typescript
// apps/desktop/src/renderer/domains/market/components/indicators-panel.tsx
import type { Indicators } from '@trading-agent/shared';
import { cn } from '@/lib/utils';

interface IndicatorsPanelProps {
  indicators: Indicators;
  latestPrice: number;
}

function IndicatorRow({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex items-center justify-between rounded-md border border-border1 bg-surface2/60 px-2.5 py-2">
      <div className="flex items-center gap-1.5 text-xs text-neutral3">
        <span>{label}</span>
        {hint && <span className="text-[10px] text-neutral2">({hint})</span>}
      </div>
      <span className="font-mono text-xs text-neutral6">{value}</span>
    </div>
  );
}

export function IndicatorsPanel({ indicators, latestPrice }: IndicatorsPanelProps) {
  const isGoldenCross = indicators.ma20 > indicators.ma60;
  const rsiLevel = indicators.rsi > 70 ? '超买' : indicators.rsi < 30 ? '超卖' : '中性';
  const macdBullish = indicators.macdHistogram > 0;

  return (
    <div className="rounded-lg border border-border1 bg-surface3/75 p-4">
      <h3 className="mb-3 text-sm font-semibold text-neutral6">技术指标</h3>
      <div className="grid grid-cols-2 gap-2">
        <IndicatorRow label="最新价" value={`$${latestPrice.toFixed(2)}`} />
        <IndicatorRow label="RSI(14)" value={indicators.rsi.toFixed(1)} hint={rsiLevel} />
        <IndicatorRow label="MA20" value={`$${indicators.ma20.toFixed(2)}`} />
        <IndicatorRow label="MA60" value={`$${indicators.ma60.toFixed(2)}`} />
        <IndicatorRow label="MACD" value={indicators.macd.toFixed(4)} />
        <IndicatorRow label="MACD Signal" value={indicators.macdSignal.toFixed(4)} />
        <IndicatorRow
          label="MACD 柱"
          value={indicators.macdHistogram.toFixed(4)}
          hint={macdBullish ? '正向' : '负向'}
        />
        <div
          className={cn(
            'flex items-center justify-between rounded-md border px-2.5 py-2',
            isGoldenCross ? 'border-emerald-400/30 bg-emerald-400/5' : 'border-rose-400/30 bg-rose-400/5',
          )}
        >
          <span className="text-xs text-neutral3">MA 交叉</span>
          <span className={cn('text-xs font-medium', isGoldenCross ? 'text-emerald-400' : 'text-rose-400')}>
            {isGoldenCross ? '金叉' : '死叉'}
          </span>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: 创建行情数据卡片（嵌入 Dashboard）**

```typescript
// apps/desktop/src/renderer/domains/market/components/market-data-card.tsx
import { Spinner } from '@mastra/playground-ui/components/Spinner';
import { KLineChart } from './kline-chart';
import { IndicatorsPanel } from './indicators-panel';
import { useMarketData } from '@/hooks/use-market-data';

interface MarketDataCardProps {
  symbol: string;
}

export function MarketDataCard({ symbol }: MarketDataCardProps) {
  const { data, isLoading, error } = useMarketData(symbol);

  if (isLoading) {
    return (
      <div className="flex h-48 items-center justify-center">
        <Spinner className="size-5" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-lg border border-border1 bg-surface3/40 p-4 text-center text-xs text-neutral3">
        行情数据加载失败
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <span className="font-mono text-lg font-semibold text-neutral6">{data.symbol}</span>
          <span className="ml-2 font-mono text-sm text-neutral4">${data.latestPrice.toFixed(2)}</span>
        </div>
        <span className="text-xs text-neutral3">{data.dataPoints} 根日线</span>
      </div>
      <KLineChart klines={data.klines} height={280} />
      <IndicatorsPanel indicators={data.indicators} latestPrice={data.latestPrice} />
    </div>
  );
}
```

- [ ] **Step 6: 验证编译 + 运行**

```bash
cd /Users/wenjunjie/Documents/antigravity/jolly-curie/apps/desktop && npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 7: Commit**

```bash
cd /Users/wenjunjie/Documents/antigravity/jolly-curie
git add apps/desktop/src/renderer/domains/market/ apps/desktop/src/renderer/hooks/use-market-data.ts apps/desktop/package.json
git commit -m "feat(desktop): add market data visualization with K-line chart and indicators panel"
```

---

## 最终验证清单

- [ ] `npm run dev`（根目录）能同时启动 agent-server 和 desktop
- [ ] 侧边栏显示「投研」（看板/协同投研/报告中心/投研角色）和「团队与工具」两组导航
- [ ] 应用启动后自动跳转到 `/dashboard`，显示自选股面板和最近报告
- [ ] 自选股可添加/删除，点击 ⚡ 跳转到协同投研页并预填标的
- [ ] 报告中心 `/reports` 显示历史报告列表，支持按标的筛选
- [ ] 报告详情页 `/reports/:id` 结构化展示 opinions / risks / trackingConditions
- [ ] 报告详情页可导出 Markdown
- [ ] 协同投研 `/collaboration` 可选 5 种协作模式
- [ ] Agent 穿梭框可选参与角色并设置 Supervisor
- [ ] 点击「开始投研」后显示加载状态，完成后展示结构化报告
- [ ] 行情数据卡片可渲染 K 线图和指标面板
- [ ] `curl http://localhost:4111/api/research/reports` 返回 JSON
- [ ] `curl http://localhost:4111/api/research/agents` 返回 JSON
- [ ] `curl http://localhost:4111/api/research/market/AAPL` 返回 K 线 + 指标 JSON

---

> [!WARNING]
> **Mastra custom routes API**: Mastra 的 `server.apiRoutes` 配置语法需根据实际 Mastra 版本确认。如果 `apiRoutes` 不被支持，改用 `registerApi` 或 Hono middleware 方式注册路由。参考 Mastra 文档：`mastra.ai/en/docs/server/custom-routes`。

> [!NOTE]
> **协作执行耗时**: Council 模式并行调用 4 个 Agent + Supervisor，DeepSeek API 响需约 10-30 秒。前端加载动画需明确告知用户正在等待，避免误以为卡死。
