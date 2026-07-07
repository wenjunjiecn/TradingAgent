import { CheckCircle2, GripVertical } from 'lucide-react';
import type { TeamMember, TeamMemberRole } from '@trading-agent/shared';

interface AgentInfo {
  id: string;
  name: string;
  description?: string;
  metadata?: { role?: string; summary?: string };
}

const ROLES: { value: TeamMemberRole; label: string }[] = [
  { value: 'leader', label: '领导者' },
  { value: 'analyst', label: '分析者' },
  { value: 'reviewer', label: '审查者' },
  { value: 'executor', label: '执行者' },
  { value: 'observer', label: '观察者' },
];

const SIDES = [
  { value: 'bull', label: '看多' },
  { value: 'bear', label: '看空' },
  { value: 'neutral', label: '中立' },
] as const;

export function TeamMemberPicker({
  agents,
  members,
  onChange,
  pattern,
}: {
  agents: AgentInfo[];
  members: TeamMember[];
  onChange: (members: TeamMember[]) => void;
  pattern: string;
}) {
  const toggleMember = (agentId: string) => {
    const existing = members.find(m => m.agentId === agentId);
    if (existing) {
      onChange(members.filter(m => m.agentId !== agentId));
    } else {
      onChange([
        ...members,
        { agentId, role: 'analyst', weight: 1, order: members.length },
      ]);
    }
  };

  const updateMember = (agentId: string, updates: Partial<TeamMember>) => {
    onChange(members.map(m => (m.agentId === agentId ? { ...m, ...updates } : m)));
  };

  const sortedMembers = [...members].sort((a, b) => a.order - b.order);
  const showSide = pattern === 'debate';
  const showOrder = pattern === 'pipeline';

  return (
    <div className="space-y-4">
      {/* 可选 Agent 列表 */}
      <div>
        <h4 className="mb-2 text-xs font-medium text-neutral3">可选 Agent</h4>
        <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
          {agents.map(agent => {
            const isSelected = members.some(m => m.agentId === agent.id);
            return (
              <button
                key={agent.id}
                type="button"
                onClick={() => toggleMember(agent.id)}
                className={`flex items-start gap-2 rounded-lg border p-2.5 text-left transition-colors ${
                  isSelected
                    ? 'border-accent1 bg-accent1/10 opacity-50'
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
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-sm font-medium text-neutral5">{agent.name}</span>
                    {agent.metadata?.role && (
                      <span className="rounded border border-border1 px-1 py-0.5 text-xs text-neutral3">
                        {agent.metadata.role}
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 truncate text-xs text-neutral3">
                    {agent.metadata?.summary ?? agent.description}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* 已选成员配置 */}
      {sortedMembers.length > 0 && (
        <div>
          <h4 className="mb-2 text-xs font-medium text-neutral3">
            团队成员（{sortedMembers.length}）
          </h4>
          <div className="space-y-2">
            {sortedMembers.map((member, idx) => {
              const agent = agents.find(a => a.id === member.agentId);
              return (
                <div
                  key={member.agentId}
                  className="flex items-center gap-2 rounded-lg border border-border1 bg-surface3 p-2.5"
                >
                  {showOrder && (
                    <GripVertical className="size-4 shrink-0 text-neutral3" />
                  )}

                  {/* 成员名称 */}
                  <div className="w-32 shrink-0">
                    <span className="text-sm font-medium text-neutral5">
                      {member.alias ?? agent?.name ?? member.agentId}
                    </span>
                  </div>

                  {/* 角色选择 */}
                  <select
                    value={member.role}
                    onChange={e => updateMember(member.agentId, { role: e.target.value as TeamMemberRole })}
                    className="rounded border border-border1 bg-surface2 px-2 py-1 text-xs text-neutral5"
                  >
                    {ROLES.map(r => (
                      <option key={r.value} value={r.value}>{r.label}</option>
                    ))}
                  </select>

                  {/* 阵营选择（仅 debate 模式） */}
                  {showSide && (
                    <select
                      value={member.side ?? 'neutral'}
                      onChange={e => updateMember(member.agentId, { side: e.target.value as 'bull' | 'bear' | 'neutral' })}
                      className="rounded border border-border1 bg-surface2 px-2 py-1 text-xs text-neutral5"
                    >
                      {SIDES.map(s => (
                        <option key={s.value} value={s.value}>{s.label}</option>
                      ))}
                    </select>
                  )}

                  {/* 权重滑块 */}
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-neutral3">权重</span>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.1}
                      value={member.weight}
                      onChange={e => updateMember(member.agentId, { weight: parseFloat(e.target.value) })}
                      className="w-20 accent-accent1"
                    />
                    <span className="w-8 text-xs text-neutral3">{member.weight.toFixed(1)}</span>
                  </div>

                  {/* 别名输入 */}
                  <input
                    type="text"
                    placeholder="别名(可选)"
                    value={member.alias ?? ''}
                    onChange={e => updateMember(member.agentId, { alias: e.target.value || undefined })}
                    className="w-24 rounded border border-border1 bg-surface2 px-2 py-1 text-xs text-neutral5 placeholder:text-neutral4"
                  />

                  {/* 顺序调整（仅 pipeline 模式） */}
                  {showOrder && (
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => updateMember(member.agentId, { order: Math.max(0, member.order - 1) })}
                        className="rounded border border-border1 px-1.5 text-xs text-neutral3 hover:bg-surface4"
                      >
                        ↑
                      </button>
                      <span className="text-xs text-neutral3">{idx + 1}</span>
                      <button
                        type="button"
                        onClick={() => updateMember(member.agentId, { order: member.order + 1 })}
                        className="rounded border border-border1 px-1.5 text-xs text-neutral3 hover:bg-surface4"
                      >
                        ↓
                      </button>
                    </div>
                  )}

                  {/* 移除按钮 */}
                  <button
                    type="button"
                    onClick={() => toggleMember(member.agentId)}
                    className="ml-auto rounded border border-red-500/30 px-2 py-0.5 text-xs text-red-400 hover:bg-red-500/10"
                  >
                    移除
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
