import { Users, GitBranch, Swords, Layers, ScanLine } from 'lucide-react';
import type { TeamCollaborationConfig, CollaborationPattern } from '@trading-agent/shared';

const PATTERNS: {
  value: CollaborationPattern;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { value: 'council', label: '圆桌会议', description: 'N 个 Agent 并行分析，Supervisor 汇总', icon: Users },
  { value: 'pipeline', label: '流水线', description: 'N 个 Agent 串行，上游输出传递给下游', icon: GitBranch },
  { value: 'debate', label: '辩论', description: '多空两方对抗，Supervisor 裁决', icon: Swords },
  { value: 'hierarchical', label: '层级委派', description: 'Supervisor 动态拆解并委派', icon: Layers },
  { value: 'parallel-scan', label: '并行扫描', description: 'N 个 Agent 分别扫描不同目标', icon: ScanLine },
];

const OUTPUT_FORMATS = [
  { value: 'research-report' as const, label: '投研报告' },
  { value: 'summary' as const, label: '摘要' },
  { value: 'custom' as const, label: '自定义' },
];

export function CollaborationConfigEditor({
  config,
  onChange,
}: {
  config: TeamCollaborationConfig;
  onChange: (config: TeamCollaborationConfig) => void;
}) {
  const update = (updates: Partial<TeamCollaborationConfig>) => {
    onChange({ ...config, ...updates });
  };

  return (
    <div className="space-y-4">
      {/* 协作模式选择 */}
      <div>
        <label className="mb-2 block text-xs font-medium text-neutral3">协作模式</label>
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
                  <div className="text-sm font-medium text-neutral5">{p.label}</div>
                  <div className="mt-0.5 text-xs text-neutral3">{p.description}</div>
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
            上游结果传递给下游
          </label>
        </div>
      )}

      {config.pattern === 'debate' && (
        <div>
          <label className="mb-1 block text-xs font-medium text-neutral3">辩论轮数</label>
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
          <label className="mb-1 block text-xs font-medium text-neutral3">Supervisor 自定义指令（可选）</label>
          <textarea
            value={config.supervisorInstructions ?? ''}
            onChange={e => update({ supervisorInstructions: e.target.value || undefined })}
            rows={3}
            placeholder="覆盖默认 Supervisor 指令..."
            className="w-full rounded border border-border1 bg-surface2 px-3 py-2 text-sm text-neutral5 placeholder:text-neutral4"
          />
        </div>
      )}

      {config.pattern === 'parallel-scan' && (
        <div>
          <label className="mb-1 block text-xs font-medium text-neutral3">默认目标列表（逗号分隔）</label>
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
  return (
    <div className="space-y-4">
      {/* 团队级共享指令 */}
      <div>
        <label className="mb-1 block text-xs font-medium text-neutral3">团队级共享指令（可选）</label>
        <textarea
          value={teamInstructions ?? ''}
          onChange={e => onChange({ teamInstructions: e.target.value || undefined })}
          rows={3}
          placeholder="注入所有成员的 prompt 前缀..."
          className="w-full rounded border border-border1 bg-surface2 px-3 py-2 text-sm text-neutral5 placeholder:text-neutral4"
        />
      </div>

      {/* 静态共享上下文 */}
      <div>
        <label className="mb-1 block text-xs font-medium text-neutral3">静态共享上下文（可选）</label>
        <textarea
          value={sharedContext ?? ''}
          onChange={e => onChange({ sharedContext: e.target.value || undefined })}
          rows={3}
          placeholder="每次执行时注入的静态上下文..."
          className="w-full rounded border border-border1 bg-surface2 px-3 py-2 text-sm text-neutral5 placeholder:text-neutral4"
        />
      </div>

      {/* 输出格式 */}
      <div className="flex items-center gap-4">
        <label className="text-xs font-medium text-neutral3">输出格式</label>
        <select
          value={outputFormat}
          onChange={e => onChange({ outputFormat: e.target.value })}
          className="rounded border border-border1 bg-surface2 px-2 py-1 text-sm text-neutral5"
        >
          {OUTPUT_FORMATS.map(f => (
            <option key={f.value} value={f.value}>{f.label}</option>
          ))}
        </select>
      </div>

      {/* 自定义输出 Schema */}
      {outputFormat === 'custom' && (
        <div>
          <label className="mb-1 block text-xs font-medium text-neutral3">自定义输出 JSON Schema</label>
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
          启用团队级共享 Memory
          <span className="text-xs text-neutral3">（跨执行保留上下文）</span>
        </label>
      </div>

      {/* 默认目标 */}
      <div>
        <label className="mb-1 block text-xs font-medium text-neutral3">默认目标（可选）</label>
        <input
          type="text"
          value={defaultTarget ?? ''}
          onChange={e => onChange({ defaultTarget: e.target.value || undefined })}
          placeholder="如 AAPL 或产品名..."
          className="w-full rounded border border-border1 bg-surface2 px-3 py-1.5 text-sm text-neutral5 placeholder:text-neutral4"
        />
      </div>
    </div>
  );
}
