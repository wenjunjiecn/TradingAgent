import { Button } from '@mastra/playground-ui/components/Button';
import { ErrorState } from '@mastra/playground-ui/components/ErrorState';
import { PageLayout } from '@mastra/playground-ui/components/PageLayout';
import { FileText, Search, Trash2 } from 'lucide-react';
import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router';
import { useReports, useDeleteReport } from '@/lib/research-api';
import type { ReportSummary } from '@/lib/research-api';

const ACTION_STYLES: Record<string, { color: string; bg: string }> = {
  BUY: { color: 'text-green-500', bg: 'bg-green-500/10' },
  SELL: { color: 'text-red-500', bg: 'bg-red-500/10' },
  HOLD: { color: 'text-yellow-500', bg: 'bg-yellow-500/10' },
  WATCH: { color: 'text-blue-400', bg: 'bg-blue-400/10' },
};

function ReportCard({ report, onDelete }: { report: ReportSummary; onDelete: () => void }) {
  const navigate = useNavigate();
  const style = ACTION_STYLES[report.action] ?? ACTION_STYLES.HOLD;

  return (
    <div className="group flex flex-col gap-3 rounded-xl border border-border1 bg-surface3 p-4 transition-colors hover:bg-surface4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="font-display text-lg font-bold text-neutral6">{report.symbol}</span>
          <span className={`rounded-md px-2 py-0.5 text-xs font-bold ${style.color} ${style.bg}`}>
            {report.action}
          </span>
          <span className="text-xs text-neutral3">
            信心度 {(report.confidence * 100).toFixed(0)}%
          </span>
        </div>
        <button
          type="button"
          className="text-neutral3 opacity-0 transition-opacity group-hover:opacity-100 hover:text-red-400"
          onClick={onDelete}
          aria-label="Delete report"
        >
          <Trash2 className="size-4" />
        </button>
      </div>
      <div>
        <h3 className="text-sm font-medium text-neutral5">{report.title}</h3>
        <p className="mt-1 line-clamp-2 text-xs text-neutral3">{report.conclusion}</p>
      </div>
      {/* 各角色观点摘要（来自 opinionTags 轻量字段） */}
      {report.opinionTags && report.opinionTags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {report.opinionTags.map((op, i) => (
            <span
              key={i}
              className="rounded border border-border1 bg-surface4 px-2 py-0.5 text-xs text-neutral3"
            >
              {op.role}
              {op.signal ? ` · ${op.signal}` : ''}
            </span>
          ))}
        </div>
      )}
      <div className="flex items-center justify-between border-t border-border1 pt-3">
        <span className="text-xs text-neutral3">
          {report.date} · ${report.price.toFixed(2)}
          {report.pattern ? ` · ${report.pattern}` : ''}
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate(`/reports/${report.id}`)}
        >
          查看详情
        </Button>
      </div>
    </div>
  );
}

export default function ReportsPage() {
  const [search, setSearch] = useState('');
  const [symbolFilter, setSymbolFilter] = useState('');
  const { data, isLoading, error } = useReports({ limit: 100 });
  const deleteReport = useDeleteReport();
  const navigate = useNavigate();

  const filtered = useMemo(() => {
    const reports = (data?.reports ?? []) as ReportSummary[];
    return reports.filter(r => {
      if (symbolFilter && !r.symbol.toLowerCase().includes(symbolFilter.toLowerCase())) {
        return false;
      }
      if (search) {
        const q = search.toLowerCase();
        return (
          r.symbol.toLowerCase().includes(q) ||
          r.title.toLowerCase().includes(q) ||
          r.conclusion.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [data, search, symbolFilter]);

  if (error) {
    return (
      <PageLayout className="p-4">
        <ErrorState title="加载报告失败" message={error.message} />
      </PageLayout>
    );
  }

  return (
    <PageLayout className="gap-4 p-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-xl font-bold text-neutral6">投研报告</h1>
          <p className="text-sm text-neutral3">查看和管理 AI 投研团队产出的分析报告</p>
        </div>
        <Button onClick={() => navigate('/collaboration')}>
          发起投研
        </Button>
      </div>

      {/* 搜索栏 */}
      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-neutral3" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="搜索报告标题、结论..."
            className="w-full rounded-lg border border-border1 bg-surface3 py-2 pl-10 pr-3 text-sm text-neutral5 outline-none placeholder:text-neutral3 focus:border-accent1"
          />
        </div>
        <input
          type="text"
          value={symbolFilter}
          onChange={e => setSymbolFilter(e.target.value)}
          placeholder="按标的筛选"
          className="w-40 rounded-lg border border-border1 bg-surface3 px-3 py-2 text-sm text-neutral5 outline-none placeholder:text-neutral3 focus:border-accent1"
        />
      </div>

      {/* 报告列表 */}
      {isLoading ? (
        <div className="flex h-64 items-center justify-center text-sm text-neutral3">加载中...</div>
      ) : filtered.length === 0 ? (
        <div className="flex h-64 flex-col items-center justify-center gap-3 text-neutral3">
          <FileText className="size-12 opacity-30" />
          <span className="text-sm">暂无报告</span>
          <Button variant="ghost" size="sm" onClick={() => navigate('/collaboration')}>
            发起第一次投研
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {filtered.map(report => (
            <ReportCard
              key={report.id}
              report={report}
              onDelete={() => deleteReport.mutate(report.id)}
            />
          ))}
        </div>
      )}
    </PageLayout>
  );
}
