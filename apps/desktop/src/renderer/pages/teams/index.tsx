import { Button } from '@mastra/playground-ui/components/Button';
import { PageLayout } from '@mastra/playground-ui/components/PageLayout';
import { Users, Plus, Play, Pencil, Trash2, GitBranch, Swords, Layers, ScanLine } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useTeamConfigs, useDeleteTeam, useTeamTemplates, useCreateTeamFromTemplate } from '@/lib/team-api';
import type { CollaborationPattern } from '@trading-agent/shared';

const PATTERN_ICONS: Record<CollaborationPattern, React.ComponentType<{ className?: string }>> = {
  council: Users,
  pipeline: GitBranch,
  debate: Swords,
  hierarchical: Layers,
  'parallel-scan': ScanLine,
};

const PATTERN_LABELS: Record<CollaborationPattern, string> = {
  council: '圆桌会议',
  pipeline: '流水线',
  debate: '辩论',
  hierarchical: '层级委派',
  'parallel-scan': '并行扫描',
};

export default function TeamsListPage() {
  const navigate = useNavigate();
  const { data: teamsData, isLoading } = useTeamConfigs();
  const { data: templatesData } = useTeamTemplates();
  const deleteTeam = useDeleteTeam();
  const createFromTemplate = useCreateTeamFromTemplate();
  const [showTemplates, setShowTemplates] = useState(false);

  const teams = teamsData?.teams ?? [];
  const templates = templatesData?.templates ?? [];

  const handleDelete = async (id: string, name: string) => {
    if (confirm(`确定删除团队「${name}」吗？`)) {
      await deleteTeam.mutateAsync(id);
    }
  };

  const handleCreateFromTemplate = async (templateId: string) => {
    const result = await createFromTemplate.mutateAsync({ templateId });
    if (result.team) {
      navigate(`/teams/${result.team.id}/edit`);
    }
    setShowTemplates(false);
  };

  return (
    <PageLayout className="gap-4 p-4">
      {/* 标题栏 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-xl font-bold text-neutral6">Agent Team</h1>
          <p className="text-sm text-neutral3">将多个 Agent 按协作模式组织为可复用的团队</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowTemplates(!showTemplates)}>
            <Plus className="mr-1 size-4" />
            从模板创建
          </Button>
          <Button size="sm" onClick={() => navigate('/teams/create')}>
            <Plus className="mr-1 size-4" />
            创建团队
          </Button>
        </div>
      </div>

      {/* 模板选择面板 */}
      {showTemplates && (
        <div className="rounded-lg border border-border1 bg-surface3 p-4">
          <h3 className="mb-3 text-sm font-semibold text-neutral6">选择团队模板</h3>
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
            {templates.map(tpl => (
              <button
                key={tpl.id}
                type="button"
                onClick={() => handleCreateFromTemplate(tpl.id)}
                className="flex flex-col gap-1 rounded-lg border border-border1 bg-surface2 p-3 text-left transition-colors hover:border-accent1 hover:bg-accent1/5"
              >
                <span className="text-sm font-medium text-neutral5">{tpl.name}</span>
                <span className="text-xs text-neutral3">{tpl.description}</span>
                <div className="mt-1 flex items-center gap-2">
                  <span className="rounded border border-border1 px-1.5 py-0.5 text-xs text-neutral3">
                    {PATTERN_LABELS[tpl.collaboration.pattern]}
                  </span>
                  <span className="text-xs text-neutral3">{tpl.members.length} 成员</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 团队列表 */}
      {isLoading ? (
        <div className="flex h-64 items-center justify-center text-sm text-neutral3">
          加载团队列表...
        </div>
      ) : teams.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 py-16">
          <Users className="size-12 text-neutral4" />
          <p className="text-sm text-neutral3">还没有团队，从模板创建或自定义一个吧</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-3">
          {teams.map(team => {
            const PatternIcon = PATTERN_ICONS[team.collaboration.pattern] ?? Users;
            return (
              <div
                key={team.id}
                className="flex flex-col gap-3 rounded-xl border border-border1 bg-surface3 p-4 transition-colors hover:border-border2"
              >
                {/* 头部 */}
                <div className="flex items-start justify-between">
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate font-display text-sm font-semibold text-neutral6">
                      {team.name}
                    </h3>
                    <p className="mt-0.5 line-clamp-2 text-xs text-neutral3">{team.description}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1 rounded border border-border1 px-1.5 py-0.5">
                    <PatternIcon className="size-3 text-neutral3" />
                    <span className="text-xs text-neutral3">
                      {PATTERN_LABELS[team.collaboration.pattern]}
                    </span>
                  </div>
                </div>

                {/* 成员预览 */}
                <div className="flex flex-wrap gap-1">
                  {team.members.slice(0, 5).map(m => (
                    <span
                      key={m.agentId}
                      className="rounded-full border border-border1 bg-surface2 px-2 py-0.5 text-xs text-neutral4"
                    >
                      {m.alias ?? m.agentId}
                    </span>
                  ))}
                  {team.members.length > 5 && (
                    <span className="text-xs text-neutral3">+{team.members.length - 5}</span>
                  )}
                </div>

                {/* 标签 */}
                {team.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {team.tags.map(tag => (
                      <span
                        key={tag}
                        className="rounded bg-accent1/10 px-1.5 py-0.5 text-xs text-accent1"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}

                {/* 操作按钮 */}
                <div className="mt-auto flex items-center gap-2 pt-2">
                  <Button size="sm" onClick={() => navigate(`/teams/${team.id}/execute`)}>
                    <Play className="mr-1 size-3.5" />
                    执行
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => navigate(`/teams/${team.id}/edit`)}>
                    <Pencil className="mr-1 size-3.5" />
                    编辑
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDelete(team.id, team.name)}
                    className="ml-auto text-red-400 hover:bg-red-500/10"
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </PageLayout>
  );
}
