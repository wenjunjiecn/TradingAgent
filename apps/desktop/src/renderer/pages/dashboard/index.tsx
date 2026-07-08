import { Button } from '@mastra/playground-ui/components/Button';
import { PageLayout } from '@mastra/playground-ui/components/PageLayout';
import { ArrowRight, FileText, TrendingUp, Users, Activity, Trash2, UsersRound } from 'lucide-react';
import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router';
import { useDashboardData, useDeleteReport } from '@/lib/research-api';
import type { ReportSummary } from '@/lib/research-api';

// ── 自选股快捷列表（本地存储） ────────────────────────────────────────
const DEFAULT_WATCHLIST = ['AAPL', 'NVDA', 'TSLA', 'GOOGL', 'MSFT'];

function useWatchlist() {
  const [watchlist, setWatchlist] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem('watchlist');
      return stored ? JSON.parse(stored) : DEFAULT_WATCHLIST;
    } catch {
      return DEFAULT_WATCHLIST;
    }
  });

  const add = (symbol: string) => {
    const upper = symbol.trim().toUpperCase();
    if (upper && !watchlist.includes(upper)) {
      const next = [...watchlist, upper];
      setWatchlist(next);
      localStorage.setItem('watchlist', JSON.stringify(next));
    }
  };

  const remove = (symbol: string) => {
    const next = watchlist.filter(s => s !== symbol);
    setWatchlist(next);
    localStorage.setItem('watchlist', JSON.stringify(next));
  };

  return { watchlist, add, remove };
}

// ── 统计卡片 ──────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  icon: Icon,
  color,
  loading,
}: {
  label: string;
  value: string | number;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  loading?: boolean;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border1 bg-surface3 p-4">
      <div className="flex items-center justify-between">
        <span className="text-sm text-neutral3">{label}</span>
        <Icon className={`size-4 ${color}`} />
      </div>
      <span
        className={`font-display text-2xl font-semibold text-neutral6 ${
          loading ? 'animate-pulse text-neutral4' : ''
        }`}
      >
        {value}
      </span>
    </div>
  );
}

// ── 自选股面板 ────────────────────────────────────────────────────────

function WatchlistPanel() {
  const { watchlist, add, remove } = useWatchlist();
  const [input, setInput] = useState('');
  const navigate = useNavigate();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim()) {
      add(input);
      setInput('');
    }
  };

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border1 bg-surface3 p-4">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-sm font-semibold text-neutral6">自选股</h3>
        <Button variant="ghost" size="sm" onClick={() => navigate('/market-data')}>
          行情 <ArrowRight className="ml-1 size-3" />
        </Button>
      </div>
      <div className="flex flex-wrap gap-2">
        {watchlist.map(symbol => (
          <div
            key={symbol}
            className="group flex items-center gap-1.5 rounded-lg border border-border1 bg-surface4 px-3 py-1.5"
          >
            <button
              type="button"
              className="text-sm font-medium text-neutral5 hover:text-neutral6"
              onClick={() => navigate(`/market-data?symbol=${symbol}`)}
            >
              {symbol}
            </button>
            <button
              type="button"
              className="text-neutral3 opacity-0 transition-opacity group-hover:opacity-100 hover:text-red-400"
              onClick={() => remove(symbol)}
              aria-label={`Remove ${symbol}`}
            >
              ×
            </button>
          </div>
        ))}
        {watchlist.length === 0 && (
          <span className="text-sm text-neutral3">暂无自选股，添加一个开始跟踪</span>
        )}
      </div>
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="添加股票代码，如 AAPL"
          className="flex-1 rounded-lg border border-border1 bg-surface4 px-3 py-1.5 text-sm text-neutral5 outline-none placeholder:text-neutral3 focus:border-accent1"
        />
        <Button type="submit" variant="default" size="sm">
          添加
        </Button>
      </form>
    </div>
  );
}

// ── 最近报告面板 ──────────────────────────────────────────────────────

function actionColor(action: string) {
  switch (action) {
    case 'BUY':
      return 'text-green-500';
    case 'SELL':
      return 'text-red-500';
    case 'HOLD':
      return 'text-yellow-500';
    default:
      return 'text-neutral3';
  }
}

function RecentReportsPanel({ reports, isLoading }: { reports: ReportSummary[]; isLoading: boolean }) {
  const deleteReport = useDeleteReport();
  const navigate = useNavigate();

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border1 bg-surface3 p-4">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-sm font-semibold text-neutral6">最近投研报告</h3>
        <Button variant="ghost" size="sm" onClick={() => navigate('/reports')}>
          全部 <ArrowRight className="ml-1 size-3" />
        </Button>
      </div>
      {isLoading ? (
        <div className="flex h-32 items-center justify-center text-sm text-neutral3">加载中...</div>
      ) : reports.length === 0 ? (
        <div className="flex h-32 flex-col items-center justify-center gap-2 text-sm text-neutral3">
          <FileText className="size-8 opacity-40" />
          <span>暂无报告，去发起一次协同投研</span>
          <Button variant="ghost" size="sm" onClick={() => navigate('/collaboration')}>
            开始投研
          </Button>
        </div>
      ) : (
        <div className="flex flex-col divide-y divide-border1">
          {reports.map(report => (
            <div
              key={report.id}
              className="group flex items-center justify-between py-2.5 first:pt-0 last:pb-0"
            >
              <button
                type="button"
                className="flex flex-1 items-center gap-3 text-left"
                onClick={() => navigate(`/reports/${report.id}`)}
              >
                <div className="flex w-14 shrink-0 flex-col">
                  <span className="text-sm font-semibold text-neutral6">{report.symbol}</span>
                  <span className="text-xs text-neutral3">{report.date}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="truncate text-sm text-neutral4">{report.title}</p>
                  <p className="truncate text-xs text-neutral3">{report.conclusion}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className={`text-sm font-bold ${actionColor(report.action)}`}>
                    {report.action}
                  </span>
                  <span className="text-xs text-neutral3">
                    {(report.confidence * 100).toFixed(0)}%
                  </span>
                </div>
              </button>
              <button
                type="button"
                className="ml-2 shrink-0 text-neutral3 opacity-0 transition-opacity group-hover:opacity-100 hover:text-red-400"
                onClick={() => deleteReport.mutate(report.id)}
                aria-label="Delete report"
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── 投研统计面板 ──────────────────────────────────────────────────────

function ResearchStatsPanel({
  stats,
  isLoading,
  isFetching,
}: {
  stats?: { total: number; bySymbol: Record<string, number>; byAction: Record<string, number> };
  isLoading: boolean;
  isFetching: boolean;
}) {
  const topSymbols = useMemo(() => {
    if (!stats?.bySymbol) return [];
    return Object.entries(stats.bySymbol)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
  }, [stats]);

  // 首次加载且无缓存数据时，用微光占位值让卡片结构立即可见
  const showShimmer = isLoading && !stats;

  return (
    <div className="grid grid-cols-3 gap-3">
      <StatCard
        label="报告总数"
        value={showShimmer ? '—' : stats?.total ?? 0}
        icon={FileText}
        color="text-blue-400"
        loading={showShimmer || (isFetching && !stats)}
      />
      <StatCard
        label="覆盖标的"
        value={showShimmer ? '—' : Object.keys(stats?.bySymbol ?? {}).length}
        icon={Activity}
        color="text-purple-400"
        loading={showShimmer || (isFetching && !stats)}
      />
      <StatCard
        label="买入建议"
        value={showShimmer ? '—' : stats?.byAction?.BUY ?? 0}
        icon={TrendingUp}
        color="text-green-400"
        loading={showShimmer || (isFetching && !stats)}
      />
      {topSymbols.length > 0 && (
        <div className="col-span-3 rounded-xl border border-border1 bg-surface3 p-4">
          <h3 className="mb-2 font-display text-sm font-semibold text-neutral6">热门标的</h3>
          <div className="flex flex-wrap gap-2">
            {topSymbols.map(([symbol, count]) => (
              <div
                key={symbol}
                className="flex items-center gap-1.5 rounded-lg border border-border1 bg-surface4 px-3 py-1"
              >
                <span className="text-sm font-medium text-neutral5">{symbol}</span>
                <span className="text-xs text-neutral3">{count} 份</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── 快捷操作面板 ──────────────────────────────────────────────────────

function QuickActionsPanel() {
  const navigate = useNavigate();

  const actions = [
    {
      label: '发起协同投研',
      description: '选择标的和 Agent 团队，一键启动多角色协作分析',
      icon: Users,
      color: 'text-blue-400',
      onClick: () => navigate('/collaboration'),
    },
    {
      label: '管理 Agent Team',
      description: '创建和管理多 Agent 协作团队，配置协作模式',
      icon: UsersRound,
      color: 'text-amber-400',
      onClick: () => navigate('/teams'),
    },
    {
      label: '查看行情数据',
      description: 'K 线图表、技术指标、基本面数据一屏总览',
      icon: TrendingUp,
      color: 'text-green-400',
      onClick: () => navigate('/market-data'),
    },
    {
      label: '浏览投研报告',
      description: '查看历史报告，追踪结论和跟踪条件',
      icon: FileText,
      color: 'text-purple-400',
      onClick: () => navigate('/reports'),
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-4">
      {actions.map(action => (
        <button
          key={action.label}
          type="button"
          onClick={action.onClick}
          className="group flex flex-col gap-2 rounded-xl border border-border1 bg-surface3 p-4 text-left transition-colors hover:bg-surface4"
        >
          <action.icon className={`size-5 ${action.color}`} />
          <span className="font-display text-sm font-semibold text-neutral6">{action.label}</span>
          <span className="text-xs text-neutral3">{action.description}</span>
        </button>
      ))}
    </div>
  );
}

// ── Dashboard 主页面 ──────────────────────────────────────────────────

export default function Dashboard() {
  // 一次聚合请求获取统计 + 最近报告摘要，替代原来 2 次独立请求
  const { data, isLoading, isFetching } = useDashboardData(8);

  return (
    <PageLayout className="gap-4 p-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-xl font-bold text-neutral6">投研看板</h1>
          <p className="text-sm text-neutral3">个人 AI 投研 Multi-Agent 系统 · 投资研究概览</p>
        </div>
      </div>

      {/* 统计 */}
      <ResearchStatsPanel stats={data?.stats} isLoading={isLoading} isFetching={isFetching} />

      {/* 快捷操作 */}
      <QuickActionsPanel />

      {/* 自选股 + 最近报告 */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <WatchlistPanel />
        <RecentReportsPanel reports={data?.recentReports ?? []} isLoading={isLoading} />
      </div>
    </PageLayout>
  );
}
