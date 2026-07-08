import { Users, GitBranch, Swords, Layers, ScanLine } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { TeamCollaborationConfig, CollaborationPattern } from '@trading-agent/shared';

const PATTERNS: {
  value: CollaborationPattern;
  labelKey: string;
  descKey: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { value: 'council', labelKey: 'teams:patterns.council', descKey: 'teams:patterns.councilDesc', icon: Users },
  { value: 'pipeline', labelKey: 'teams:patterns.pipeline', descKey: 'teams:patterns.pipelineDesc', icon: GitBranch },
  { value: 'debate', labelKey: 'teams:patterns.debate', descKey: 'teams:patterns.debateDesc', icon: Swords },
  { value: 'hierarchical', labelKey: 'teams:patterns.hierarchical', descKey: 'teams:patterns.hierarchicalDesc', icon: Layers },
  { value: 'parallel-scan', labelKey: 'teams:patterns.parallelScan', descKey: 'teams:patterns.parallelScanDesc', icon: ScanLine },
];

const OUTPUT_FORMAT_KEYS = [
  { value: 'research-report' as const, key: 'teams:outputFormats.research-report' },
  { value: 'summary' as const, key: 'teams:outputFormats.summary' },
  { value: 'custom' as const, key: 'teams:outputFormats.custom' },
];

export function CollaborationConfigEditor({
  config,
  onChange,
}: {
  config: TeamCollaborationConfig;
  onChange: (config: TeamCollaborationConfig) => void;
}) {
  const { t } = useTranslation('teams');
  const update = (updates: Partial<TeamCollaborationConfig>) => {
    onChange({ ...config, ...updates });
  };

  return (
    <div className="space-y-4">
      {/* 协作模式选择 */}
      <div>
        <label className="mb-2 block text-xs font-medium text-neutral3">{t('config.pattern')}</label>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {PATTERNS.map(p => {
            const Icon = p.icon;
            const isSelected = config.pattern === p.value;
            return (
              <button
                key={p.value}
                type="button"
                onClick={() => update({ pattern: p.value })}
                className={`flex items-start gap-2 rounded-lg border p-3 text-left transition-colors ${
                  isSelected
                    ? 'border-accent1 bg-accent1/10'
                    : 'border-border1 bg-surface3 hover:bg-surface4'
                }`}
              >
                <Icon className={`mt-0.5 size-4 shrink-0 ${isSelected ? 'text-accent1' : 'text-neutral3'}`} />
                <div className="min-w-0">
                  <div className="text-sm font-medium text-neutral5">{t(p.labelKey)}</div>
                  <div className="mt-0.5 text-xs text-neutral3">{t(p.descKey)}</div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* 模式特定参数 */}
      {config.pattern === 'pipeline' && (
        <div>
          <label className="flex items-center gap-2 text-sm text-neutral5">
            <input
              type="checkbox"
              checked={config.passThroughContext}
              onChange={e => update({ passThroughContext: e.target.checked })}
              className="accent-accent1"
            />
            {t('config.passThroughContext')}
          </label>
        </div>
      )}

      {config.pattern === 'debate' && (
        <div>
          <label className="mb-1 block text-xs font-medium text-neutral3">{t('config.rounds')}</label>
          <input
            type="number"
            min={1}
            max={5}
            value={config.rounds}
            onChange={e => update({ rounds: parseInt(e.target.value, 10) || 1 })}
            className="w-24 rounded border border-border1 bg-surface2 px-2 py-1 text-sm text-neutral5"
          />
        </div>
      )}

      {config.pattern === 'hierarchical' && (
        <div>
          <label className="mb-1 block text-xs font-medium text-neutral3">{t('config.supervisorInstructions')}</label>
          <textarea
            value={config.supervisorInstructions ?? ''}
            onChange={e => update({ supervisorInstructions: e.target.value || undefined })}
            rows={3}
            placeholder={t('config.supervisorInstructionsPlaceholder')}
            className="w-full rounded border border-border1 bg-surface2 px-3 py-2 text-sm text-neutral5 placeholder:text-neutral4"
          />
        </div>
      )}

      {config.pattern === 'parallel-scan' && (
        <div>
          <label className="mb-1 block text-xs font-medium text-neutral3">{t('config.defaultTargets')}</label>
          <input
            type="text"
            value={config.targets?.join(', ') ?? ''}
            onChange={e => update({ targets: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })}
            placeholder="AAPL, GOOGL, MSFT"
            className="w-full rounded border border-border1 bg-surface2 px-3 py-1.5 text-sm text-neutral5 placeholder:text-neutral4"
          />
        </div>
      )}
    </div>
  );
}

export function TeamLevelConfig({
  teamInstructions,
  sharedContext,
  outputFormat,
  sharedMemoryEnabled,
  defaultTarget,
  customOutputSchema,
  onChange,
}: {
  teamInstructions?: string;
  sharedContext?: string;
  outputFormat: 'research-report' | 'summary' | 'custom';
  sharedMemoryEnabled: boolean;
  defaultTarget?: string;
  customOutputSchema?: string;
  onChange: (updates: Record<string, any>) => void;
}) {
  const { t } = useTranslation('teams');
  return (
    <div className="space-y-4">
      {/* 团队级共享指令 */}
      <div>
        <label className="mb-1 block text-xs font-medium text-neutral3">{t('config.teamInstructions')}</label>
        <textarea
          value={teamInstructions ?? ''}
          onChange={e => onChange({ teamInstructions: e.target.value || undefined })}
          rows={3}
          placeholder={t('config.teamInstructionsPlaceholder')}
          className="w-full rounded border border-border1 bg-surface2 px-3 py-2 text-sm text-neutral5 placeholder:text-neutral4"
        />
      </div>

      {/* 静态共享上下文 */}
      <div>
        <label className="mb-1 block text-xs font-medium text-neutral3">{t('config.sharedContext')}</label>
        <textarea
          value={sharedContext ?? ''}
          onChange={e => onChange({ sharedContext: e.target.value || undefined })}
          rows={3}
          placeholder={t('config.sharedContextPlaceholder')}
          className="w-full rounded border border-border1 bg-surface2 px-3 py-2 text-sm text-neutral5 placeholder:text-neutral4"
        />
      </div>

      {/* 输出格式 */}
      <div className="flex items-center gap-4">
        <label className="text-xs font-medium text-neutral3">{t('config.outputFormat')}</label>
        <select
          value={outputFormat}
          onChange={e => onChange({ outputFormat: e.target.value })}
          className="rounded border border-border1 bg-surface2 px-2 py-1 text-sm text-neutral5"
        >
          {OUTPUT_FORMAT_KEYS.map(f => (
            <option key={f.value} value={f.value}>{t(f.key)}</option>
          ))}
        </select>
      </div>

      {/* 自定义输出 Schema */}
      {outputFormat === 'custom' && (
        <div>
          <label className="mb-1 block text-xs font-medium text-neutral3">{t('config.customSchema')}</label>
          <textarea
            value={customOutputSchema ?? ''}
            onChange={e => onChange({ customOutputSchema: e.target.value || undefined })}
            rows={5}
            placeholder='{"type":"object","properties":{...}}'
            className="w-full rounded border border-border1 bg-surface2 px-3 py-2 font-mono text-xs text-neutral5 placeholder:text-neutral4"
          />
        </div>
      )}

      {/* 共享 Memory */}
      <div>
        <label className="flex items-center gap-2 text-sm text-neutral5">
          <input
            type="checkbox"
            checked={sharedMemoryEnabled}
            onChange={e => onChange({ sharedMemoryEnabled: e.target.checked })}
            className="accent-accent1"
          />
          {t('config.sharedMemory')}
          <span className="text-xs text-neutral3">{t('config.sharedMemoryHint')}</span>
        </label>
      </div>

      {/* 默认目标 */}
      <div>
        <label className="mb-1 block text-xs font-medium text-neutral3">{t('config.defaultTarget')}</label>
        <input
          type="text"
          value={defaultTarget ?? ''}
          onChange={e => onChange({ defaultTarget: e.target.value || undefined })}
          placeholder={t('config.defaultTargetPlaceholder')}
          className="w-full rounded border border-border1 bg-surface2 px-3 py-1.5 text-sm text-neutral5 placeholder:text-neutral4"
        />
      </div>
    </div>
  );
}
