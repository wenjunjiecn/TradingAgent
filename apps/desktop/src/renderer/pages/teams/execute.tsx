import { Button } from '@mastra/playground-ui/components/Button';
import { ErrorState } from '@mastra/playground-ui/components/ErrorState';
import { PageLayout } from '@mastra/playground-ui/components/PageLayout';
import { ArrowLeft, Play, Loader2, CheckCircle2, XCircle, Users, GitBranch, Swords, Layers, ScanLine, Trash2, MessageCircle } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router';
import { useTeamConfig, useExecuteTeam, useClearTeamMemory } from '@/lib/team-api';
import type { CollaborationPattern } from '@trading-agent/shared';

const PATTERN_ICONS: Record<CollaborationPattern, React.ComponentType<{ className?: string }>> = {
  council: Users,
  pipeline: GitBranch,
  debate: Swords,
  hierarchical: Layers,
  'parallel-scan': ScanLine,
};

const PATTERN_LABEL_KEYS: Record<CollaborationPattern, string> = {
  council: 'teams:patterns.council',
  pipeline: 'teams:patterns.pipeline',
  debate: 'teams:patterns.debate',
  hierarchical: 'teams:patterns.hierarchical',
  'parallel-scan': 'teams:patterns.parallelScan',
};

type ExecState = 'idle' | 'running' | 'success' | 'error';

export default function TeamExecutePage() {
  const { t } = useTranslation(['teams', 'common']);
  const { teamId } = useParams();
  const navigate = useNavigate();
  const { data: teamData, isLoading } = useTeamConfig(teamId ?? null);
  const executeTeam = useExecuteTeam();
  const clearMemory = useClearTeamMemory();

  const [task, setTask] = useState('');
  const [target, setTarget] = useState('');
  const [extraContext, setExtraContext] = useState('');
  const [targets, setTargets] = useState('');
  const [execState, setExecState] = useState<ExecState>('idle');
  const [execError, setExecError] = useState<string | null>(null);
  const [resultId, setResultId] = useState<string | null>(null);

  const team = teamData?.team;
  const PatternIcon = team ? PATTERN_ICONS[team.collaboration.pattern] : Users;
  const isParallelScan = team?.collaboration.pattern === 'parallel-scan';

  // 初始化默认值
  useState(() => {
    if (team?.defaultTarget) setTarget(team.defaultTarget);
  });

  const canStart = task.trim() && execState !== 'running' &&
    (!isParallelScan || targets.trim());

  const handleStart = async () => {
    if (!canStart || !team) return;
    setExecState('running');
    setExecError(null);
    setResultId(null);

    try {
      const params: { teamId: string; task: string; target?: string; targets?: string[]; extraContext?: string } = {
        teamId: team.id,
        task: task.trim(),
      };

      if (isParallelScan) {
        params.targets = targets.split(',').map(s => s.trim()).filter(Boolean);
      } else if (target.trim()) {
        params.target = target.trim();
      }

      if (extraContext.trim()) {
        params.extraContext = extraContext.trim();
      }

      const result = await executeTeam.mutateAsync(params);
      setExecState('success');
      setResultId(result.result.id ?? null);
    } catch (err) {
      setExecState('error');
      setExecError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleClearMemory = async () => {
    if (!team) return;
    if (confirm(t('teams:execute.clearMemoryConfirm'))) {
      await clearMemory.mutateAsync(team.id);
    }
  };

  if (isLoading) {
    return (
      <PageLayout className="flex items-center justify-center p-8">
        <Loader2 className="size-6 animate-spin text-neutral3" />
      </PageLayout>
    );
  }

  if (!team) {
    return (
      <PageLayout className="p-4">
        <ErrorState title={t('teams:execute.teamNotFound')} message={t('teams:execute.teamNotFoundDesc', { id: teamId })} />
      </PageLayout>
    );
  }

  return (
    <PageLayout className="gap-4 p-4">
      {/* 顶部操作栏 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate('/teams')}>
            <ArrowLeft className="mr-1 size-4" />
            {t('teams:edit.back')}
          </Button>
          <h1 className="font-display text-xl font-bold text-neutral6">{team.name}</h1>
        </div>
        <Button variant="outline" size="sm" onClick={() => navigate(`/teams/${teamId}/chat`)}>
          <MessageCircle className="mr-1 size-3.5" />
          Chat 模式
        </Button>
      </div>

      {/* 团队信息卡片 */}
      <div className="rounded-lg border border-border1 bg-surface3 p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <p className="text-sm text-neutral4">{team.description}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1 rounded border border-border1 px-2 py-0.5">
                <PatternIcon className="size-3 text-neutral3" />
                <span className="text-xs text-neutral3">{t(PATTERN_LABEL_KEYS[team.collaboration.pattern])}</span>
              </div>
              <span className="text-xs text-neutral3">
                {t('teams:list.members', { count: team.members.length })}
              </span>
              {team.supervisorAgentId && (
                <span className="text-xs text-neutral3">Supervisor: {team.supervisorAgentId}</span>
              )}
              {team.sharedMemoryEnabled && (
                <span className="rounded bg-accent1/10 px-1.5 py-0.5 text-xs text-accent1">
                  {t('teams:execute.sharedMemory')}
                </span>
              )}
            </div>
            <div className="mt-2 flex flex-wrap gap-1">
              {team.members.map(m => (
                <span
                  key={m.agentId}
                  className="rounded-full border border-border1 bg-surface2 px-2 py-0.5 text-xs text-neutral4"
                >
                  {m.alias ?? m.agentId}
                  {m.side && m.side !== 'neutral' && ` (${m.side === 'bull' ? t('teams:sides.bullShort') : t('teams:sides.bearShort')})`}
                </span>
              ))}
            </div>
          </div>
          {team.sharedMemoryEnabled && (
            <Button variant="outline" size="sm" onClick={handleClearMemory} className="text-red-400">
              <Trash2 className="mr-1 size-3.5" />
              {t('teams:execute.clearMemory')}
            </Button>
          )}
        </div>
      </div>

      {/* 任务输入区 */}
      <div className="space-y-3 rounded-lg border border-border1 bg-surface3 p-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-neutral3">{t('teams:execute.task')}</label>
          <textarea
            value={task}
            onChange={e => setTask(e.target.value)}
            rows={4}
            placeholder={t('teams:execute.taskPlaceholder')}
            className="w-full rounded border border-border1 bg-surface2 px-3 py-2 text-sm text-neutral5 placeholder:text-neutral4"
          />
        </div>

        {/* 目标输入 */}
        {isParallelScan ? (
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral3">{t('teams:execute.targets')}</label>
            <input
              type="text"
              value={targets}
              onChange={e => setTargets(e.target.value)}
              placeholder={t('teams:execute.targetsPlaceholder')}
              className="w-full rounded border border-border1 bg-surface2 px-3 py-1.5 text-sm text-neutral5 placeholder:text-neutral4"
            />
          </div>
        ) : (
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral3">
              {t('teams:execute.targetOptional', {
                default: team.defaultTarget ? t('teams:execute.targetDefaultHint', { target: team.defaultTarget }) : ''
              })}
            </label>
            <input
              type="text"
              value={target}
              onChange={e => setTarget(e.target.value)}
              placeholder={t('teams:execute.targetHint')}
              className="w-full rounded border border-border1 bg-surface2 px-3 py-1.5 text-sm text-neutral5 placeholder:text-neutral4"
            />
          </div>
        )}

        {/* 额外上下文 */}
        <div>
          <label className="mb-1 block text-xs font-medium text-neutral3">{t('teams:execute.extraContext')}</label>
          <textarea
            value={extraContext}
            onChange={e => setExtraContext(e.target.value)}
            rows={2}
            placeholder={t('teams:execute.extraContextPlaceholder')}
            className="w-full rounded border border-border1 bg-surface2 px-3 py-2 text-sm text-neutral5 placeholder:text-neutral4"
          />
        </div>

        {/* 启动按钮 */}
        <div className="flex items-center gap-3">
          <Button onClick={handleStart} disabled={!canStart} size="lg">
            {execState === 'running' ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                {t('teams:execute.running')}
              </>
            ) : (
              <>
                <Play className="mr-2 size-4" />
                {t('teams:execute.start')}
              </>
            )}
          </Button>
          {execState === 'success' && (
            <span className="flex items-center gap-1 text-sm text-green-500">
              <CheckCircle2 className="size-4" />
              {t('teams:execute.success')}
              {resultId && (
                <button
                  onClick={() => navigate(`/reports/${resultId}`)}
                  className="ml-1 text-accent1 underline hover:no-underline"
                >
                  {t('teams:execute.viewReport')}
                </button>
              )}
            </span>
          )}
        </div>

        {/* 执行状态 */}
        {execState === 'error' && execError && (
          <ErrorState title={t('teams:execute.failed')} message={execError} />
        )}
      </div>
    </PageLayout>
  );
}
