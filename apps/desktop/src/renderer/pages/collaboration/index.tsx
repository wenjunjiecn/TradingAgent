import { Button } from '@mastra/playground-ui/components/Button';
import { ErrorState } from '@mastra/playground-ui/components/ErrorState';
import { PageLayout } from '@mastra/playground-ui/components/PageLayout';
import {
  Users,
  GitBranch,
  Swords,
  Layers,
  ScanLine,
  Play,
  Loader2,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router';
import { useAgentConfigs, useStartCollaboration } from '@/lib/research-api';
import { useTeamConfigs } from '@/lib/team-api';
import type { CollaborationPattern } from '@trading-agent/shared';

// ── 协作模式配置 ──────────────────────────────────────────────────────

const PATTERNS: {
  value: CollaborationPattern;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  {
    value: 'council',
    label: '圆桌会议',
    description: 'N 个 Agent 并行分析同一标的，Supervisor 汇总各方观点',
    icon: Users,
  },
  {
    value: 'pipeline',
    label: '流水线',
    description: 'N 个 Agent 串行分析，上游输出传递给下游',
    icon: GitBranch,
  },
  {
    value: 'debate',
    label: '辩论',
    description: '多空两方对抗分析，Supervisor 裁决',
    icon: Swords,
  },
  {
    value: 'hierarchical',
    label: '层级委派',
    description: 'Supervisor 动态拆解任务并委派子 Agent',
    icon: Layers,
  },
  {
    value: 'parallel-scan',
    label: '并行扫描',
    description: 'N 个 Agent 分别扫描不同标的，返回多份报告',
    icon: ScanLine,
  },
];

// ── Agent 选择器 ──────────────────────────────────────────────────────

function AgentTeamPicker({
  agents,
  selected,
  onChange,
}: {
  agents: { id: string; name: string; description?: string; metadata?: { role?: string; summary?: string } }[];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const toggle = (id: string) => {
    if (selected.includes(id)) {
      onChange(selected.filter(x => x !== id));
    } else {
      onChange([...selected, id]);
    }
  };

  return (
    <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
      {agents.map(agent => {
        const isSelected = selected.includes(agent.id);
        return (
          <button
            key={agent.id}
            type="button"
            onClick={() => toggle(agent.id)}
            className={`flex items-start gap-3 rounded-lg border p-3 text-left transition-colors ${
              isSelected
                ? 'border-accent1 bg-accent1/10'
                : 'border-border1 bg-surface3 hover:bg-surface4'
            }`}
          >
            <div
              className={`mt-0.5 flex size-4 shrink-0 items-center justify-center rounded border ${
                isSelected ? 'border-accent1 bg-accent1 text-white' : 'border-border1'
              }`}
            >
              {isSelected && <CheckCircle2 className="size-3" />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-neutral5">{agent.name}</span>
                {agent.metadata?.role && (
                  <span className="rounded border border-border1 px-1.5 py-0.5 text-xs text-neutral3">
                    {agent.metadata.role}
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-xs text-neutral3 truncate">
                {agent.metadata?.summary ?? agent.description}
              </p>
            </div>
          </button>
        );
      })}
    </div>
  );
}

// ── 协作进度展示 ──────────────────────────────────────────────────────

type CollabState = 'idle' | 'running' | 'success' | 'error';

function CollaborationProgress({
  state,
  error,
}: {
  state: CollabState;
  error: string | null;
}) {
  if (state === 'idle') return null;

  const steps = [
    { label: '获取行情数据', desc: '拉取 K 线并计算技术指标' },
    { label: '执行协作分析', desc: '多角色 Agent 协同分析' },
    { label: '汇总产出报告', desc: 'Supervisor 综合研判' },
  ];

  return (
    <div className="rounded-xl border border-border1 bg-surface3 p-4">
      <h3 className="font-display text-sm font-semibold text-neutral6 mb-3">执行进度</h3>
      <div className="flex flex-col gap-3">
        {steps.map((step, i) => {
          const isRunning = state === 'running';
          const isSuccess = state === 'success';
          const isError = state === 'error';

          return (
            <div key={i} className="flex items-center gap-3">
              <div className="shrink-0">
                {isSuccess ? (
                  <CheckCircle2 className="size-5 text-green-500" />
                ) : isError && i === steps.length - 1 ? (
                  <XCircle className="size-5 text-red-500" />
                ) : isRunning ? (
                  <Loader2 className="size-5 animate-spin text-blue-400" />
                ) : (
                  <div className="size-5 rounded-full border-2 border-border1" />
                )}
              </div>
              <div>
                <p
                  className={`text-sm ${
                    isSuccess || (isRunning && i === 0)
                      ? 'text-neutral6'
                      : isRunning
                        ? 'text-neutral4'
                        : 'text-neutral3'
                  }`}
                >
                  {step.label}
                </p>
                <p className="text-xs text-neutral3">{step.desc}</p>
              </div>
            </div>
          );
        })}
      </div>
      {isError && error && (
        <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 p-3">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}
    </div>
  );
}

// ── 主页面 ────────────────────────────────────────────────────────────

export default function CollaborationPage() {
  const navigate = useNavigate();
  const { data: agentsData, isLoading: agentsLoading, error: agentsError } = useAgentConfigs();
  const { data: teamsData } = useTeamConfigs();
  const startCollaboration = useStartCollaboration();

  const [symbol, setSymbol] = useState('');
  const [pattern, setPattern] = useState<CollaborationPattern>('council');
  const [selectedAgentIds, setSelectedAgentIds] = useState<string[]>([
    'trading-agent',
    'market-analysis-agent',
    'sentiment-analysis-agent',
    'risk-analysis-agent',
  ]);
  const [collabState, setCollabState] = useState<CollabState>('idle');
  const [collabError, setCollabError] = useState<string | null>(null);

  const agents = useMemo(() => agentsData?.agents ?? [], [agentsData]);

  const canStart = symbol.trim() && selectedAgentIds.length >= 1 && collabState !== 'running';

  const handleStart = async () => {
    if (!canStart) return;
    setCollabState('running');
    setCollabError(null);

    try {
      const result = await startCollaboration.mutateAsync({
        symbol: symbol.trim().toUpperCase(),
        pattern,
        participantAgentIds: selectedAgentIds,
        supervisorAgentId: 'research-supervisor',
      });

      setCollabState('success');

      // 延迟跳转到报告详情
      const report = Array.isArray(result.result) ? result.result[0] : result.result;
      if (report?.id) {
        setTimeout(() => navigate(`/reports/${report.id}`), 1500);
      } else {
        setTimeout(() => navigate('/reports'), 1500);
      }
    } catch (err) {
      setCollabState('error');
      setCollabError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <PageLayout className="gap-4 p-4">
      <div>
        <h1 className="font-display text-xl font-bold text-neutral6">协同投研</h1>
        <p className="text-sm text-neutral3">配置 Agent 团队和协作模式，启动多角色投研分析</p>
      </div>

      {/* 已有 Team 快速选择 */}
      {teamsData?.teams && teamsData.teams.length > 0 && (
        <div className="rounded-xl border border-accent1/30 bg-accent1/5 p-4">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="font-display text-sm font-semibold text-neutral6">已有团队快速执行</h3>
            <Button variant="ghost" size="sm" onClick={() => navigate('/teams')}>
              管理团队
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {teamsData.teams.map(team => (
              <button
                key={team.id}
                type="button"
                onClick={() => navigate(`/teams/${team.id}/execute`)}
                className="flex items-center gap-1.5 rounded-lg border border-border1 bg-surface3 px-3 py-1.5 text-sm text-neutral5 transition-colors hover:border-accent1 hover:bg-accent1/10"
              >
                <span>{team.name}</span>
                <span className="text-xs text-neutral3">{team.members.length} 成员</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 快速配置区域 */}
      <div className="rounded-xl border border-border1 bg-surface3 p-3">
        <p className="text-xs text-neutral3">以下为快速配置模式，如需更多配置选项请使用 Agent Team 管理</p>
      </div>

      {/* 标的输入 */}
      <div className="rounded-xl border border-border1 bg-surface3 p-4">
        <label className="mb-2 block font-display text-sm font-semibold text-neutral6">
          分析标的
        </label>
        <input
          type="text"
          value={symbol}
          onChange={e => setSymbol(e.target.value.toUpperCase())}
          placeholder="输入美股代码，如 AAPL, NVDA, TSLA"
          className="w-full rounded-lg border border-border1 bg-surface4 px-4 py-2.5 text-base font-medium text-neutral6 outline-none placeholder:text-neutral3 focus:border-accent1"
        />
      </div>

      {/* 协作模式选择 */}
      <div>
        <h3 className="mb-3 font-display text-sm font-semibold text-neutral6">协作模式</h3>
        <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
          {PATTERNS.map(p => {
            const isSelected = pattern === p.value;
            return (
              <button
                key={p.value}
                type="button"
                onClick={() => setPattern(p.value)}
                className={`flex items-start gap-3 rounded-xl border p-4 text-left transition-colors ${
                  isSelected
                    ? 'border-accent1 bg-accent1/10'
                    : 'border-border1 bg-surface3 hover:bg-surface4'
                }`}
              >
                <p.icon
                  className={`size-5 shrink-0 ${isSelected ? 'text-accent1' : 'text-neutral3'}`}
                />
                <div>
                  <span className="text-sm font-semibold text-neutral6">{p.label}</span>
                  <p className="mt-0.5 text-xs text-neutral3">{p.description}</p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Agent 团队选择 */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-display text-sm font-semibold text-neutral6">
            Agent 团队
            <span className="ml-2 text-xs text-neutral3">已选 {selectedAgentIds.length} 个</span>
          </h3>
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelectedAgentIds(agents.map(a => a.id))}
            >
              全选
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setSelectedAgentIds([])}>
              清空
            </Button>
          </div>
        </div>
        {agentsLoading ? (
          <div className="flex h-32 items-center justify-center text-sm text-neutral3">
            加载 Agent 列表...
          </div>
        ) : agentsError ? (
          <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-500">
            <XCircle className="size-4 shrink-0" />
            <span>Agent 列表加载失败: {agentsError.message}</span>
          </div>
        ) : (
          <AgentTeamPicker
            agents={agents}
            selected={selectedAgentIds}
            onChange={setSelectedAgentIds}
          />
        )}
      </div>

      {/* 启动按钮 */}
      <div className="flex items-center gap-3">
        <Button
          onClick={handleStart}
          disabled={!canStart}
          size="lg"
        >
          {collabState === 'running' ? (
            <>
              <Loader2 className="mr-2 size-4 animate-spin" />
              投研分析中...
            </>
          ) : (
            <>
              <Play className="mr-2 size-4" />
              启动协同投研
            </>
          )}
        </Button>
        {collabState === 'success' && (
          <span className="text-sm text-green-500">投研完成！正在跳转报告...</span>
        )}
      </div>

      {/* 执行进度 */}
      <CollaborationProgress state={collabState} error={collabError} />

      {collabError && (
        <ErrorState title="投研执行失败" message={collabError} />
      )}
    </PageLayout>
  );
}
