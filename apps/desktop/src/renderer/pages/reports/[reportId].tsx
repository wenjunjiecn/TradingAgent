import { Button } from '@mastra/playground-ui/components/Button';
import { ErrorState } from '@mastra/playground-ui/components/ErrorState';
import { PageLayout } from '@mastra/playground-ui/components/PageLayout';
import { ArrowLeft, AlertTriangle, Target, ClipboardList } from 'lucide-react';
import { useParams, useNavigate } from 'react-router';
import { useReport } from '@/lib/research-api';
import type { AgentOpinion, RiskItem, TrackingCondition } from '@trading-agent/shared';

const ACTION_STYLES: Record<string, string> = {
  BUY: 'text-green-500 bg-green-500/10',
  SELL: 'text-red-500 bg-red-500/10',
  HOLD: 'text-yellow-500 bg-yellow-500/10',
  WATCH: 'text-blue-400 bg-blue-400/10',
};

const SEVERITY_STYLES: Record<string, string> = {
  low: 'text-blue-400 border-blue-400/30',
  medium: 'text-yellow-500 border-yellow-500/30',
  high: 'text-red-500 border-red-500/30',
};

function OpinionCard({ opinion }: { opinion: AgentOpinion }) {
  const signalColor =
    opinion.signal === 'BUY'
      ? 'text-green-500'
      : opinion.signal === 'SELL'
        ? 'text-red-500'
        : opinion.signal === 'WATCH'
          ? 'text-blue-400'
          : 'text-yellow-500';

  return (
    <div className="rounded-xl border border-border1 bg-surface3 p-4">
      <div className="flex items-center justify-between mb-2">
        <h4 className="font-display text-sm font-semibold text-neutral6">{opinion.role}</h4>
        <div className="flex items-center gap-2">
          {opinion.signal && (
            <span className={`text-xs font-bold ${signalColor}`}>{opinion.signal}</span>
          )}
          {opinion.confidence !== undefined && (
            <span className="text-xs text-neutral3">
              信心度 {(opinion.confidence * 100).toFixed(0)}%
            </span>
          )}
        </div>
      </div>
      <p className="text-sm text-neutral5 mb-2">{opinion.summary}</p>
      <p className="text-xs text-neutral3 leading-relaxed">{opinion.details}</p>
    </div>
  );
}

export default function ReportDetailPage() {
  const { reportId } = useParams<{ reportId: string }>();
  const navigate = useNavigate();
  const { data, isLoading, error } = useReport(reportId ?? null);
  const report = data?.report;

  if (isLoading) {
    return (
      <PageLayout className="p-4">
        <div className="flex h-64 items-center justify-center text-sm text-neutral3">加载中...</div>
      </PageLayout>
    );
  }

  if (error) {
    return (
      <PageLayout className="p-4">
        <ErrorState title="加载报告失败" message={error.message} />
      </PageLayout>
    );
  }

  if (!report) {
    return (
      <PageLayout className="p-4">
        <ErrorState title="报告未找到" message="该报告可能已被删除" />
      </PageLayout>
    );
  }

  const actionStyle = ACTION_STYLES[report.action] ?? ACTION_STYLES.HOLD;

  return (
    <PageLayout className="gap-4 p-4">
      {/* 返回按钮 */}
      <Button variant="ghost" size="sm" onClick={() => navigate('/reports')}>
        <ArrowLeft className="mr-1 size-4" /> 返回报告列表
      </Button>

      {/* 报告头部 */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-2">
            <h1 className="font-display text-2xl font-bold text-neutral6">{report.symbol}</h1>
            <span className={`rounded-md px-2.5 py-0.5 text-sm font-bold ${actionStyle}`}>
              {report.action}
            </span>
            <span className="text-sm text-neutral3">
              信心度 {(report.confidence * 100).toFixed(0)}%
            </span>
          </div>
          <h2 className="text-base text-neutral5">{report.title}</h2>
          <p className="mt-1 text-xs text-neutral3">
            {report.date} · ${report.price.toFixed(2)}
            {report.pattern ? ` · 协作模式: ${report.pattern}` : ''}
          </p>
        </div>
      </div>

      {/* 综合结论 */}
      <div className="rounded-xl border border-border1 bg-surface3 p-4">
        <h3 className="font-display text-sm font-semibold text-neutral6 mb-2">综合结论</h3>
        <p className="text-sm text-neutral4 leading-relaxed">{report.conclusion}</p>
      </div>

      {/* 各角色分析 */}
      {report.opinions && report.opinions.length > 0 && (
        <div>
          <h3 className="font-display text-sm font-semibold text-neutral6 mb-3">各角色分析</h3>
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {report.opinions.map((op, i) => (
              <OpinionCard key={i} opinion={op} />
            ))}
          </div>
        </div>
      )}

      {/* 风险清单 */}
      {report.risks && report.risks.length > 0 && (
        <div>
          <h3 className="font-display text-sm font-semibold text-neutral6 mb-3 flex items-center gap-2">
            <AlertTriangle className="size-4 text-yellow-500" /> 风险清单
          </h3>
          <div className="flex flex-col gap-2">
            {report.risks.map((risk: RiskItem, i: number) => (
              <div
                key={i}
                className={`flex items-center gap-3 rounded-lg border bg-surface3 p-3 ${
                  SEVERITY_STYLES[risk.severity] ?? ''
                }`}
              >
                <span className="rounded px-2 py-0.5 text-xs font-medium text-neutral4">
                  {risk.category}
                </span>
                <span className="flex-1 text-sm text-neutral4">{risk.description}</span>
                <span className="text-xs font-bold uppercase">{risk.severity}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 跟踪条件 */}
      {report.trackingConditions && report.trackingConditions.length > 0 && (
        <div>
          <h3 className="font-display text-sm font-semibold text-neutral6 mb-3 flex items-center gap-2">
            <Target className="size-4 text-blue-400" /> 跟踪条件
          </h3>
          <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
            {report.trackingConditions.map((cond: TrackingCondition, i: number) => (
              <div
                key={i}
                className="rounded-lg border border-border1 bg-surface3 p-3"
              >
                <div className="flex items-center gap-2 mb-1">
                  <ClipboardList className="size-3.5 text-neutral3" />
                  <span className="text-sm font-medium text-neutral5">{cond.metric}</span>
                </div>
                <p className="text-xs text-neutral3">触发条件: {cond.threshold}</p>
                <p className="text-xs text-neutral4 mt-1">建议动作: {cond.action}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 技术信号 */}
      {report.signal && (
        <div className="rounded-xl border border-border1 bg-surface3 p-4">
          <h3 className="font-display text-sm font-semibold text-neutral6 mb-3">技术交易信号</h3>
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <span className="text-neutral3">RSI(14)</span>
              <p className="font-display text-lg text-neutral6">
                {report.signal.indicators.rsi.toFixed(2)}
              </p>
            </div>
            <div>
              <span className="text-neutral3">MA20</span>
              <p className="font-display text-lg text-neutral6">
                {report.signal.indicators.ma20.toFixed(2)}
              </p>
            </div>
            <div>
              <span className="text-neutral3">MACD</span>
              <p className="font-display text-lg text-neutral6">
                {report.signal.indicators.macd.toFixed(4)}
              </p>
            </div>
          </div>
          <p className="mt-3 text-xs text-neutral3">{report.signal.reason}</p>
        </div>
      )}
    </PageLayout>
  );
}
