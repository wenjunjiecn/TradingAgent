import { Button } from '@mastra/playground-ui/components/Button';
import { PageLayout } from '@mastra/playground-ui/components/PageLayout';
import { ArrowLeft, Save, Loader2, AlertCircle } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useAgentConfigs } from '@/lib/research-api';
import { useTeamConfig, useCreateTeam, useUpdateTeam } from '@/lib/team-api';
import { TeamMemberPicker } from './components/TeamMemberPicker';
import { CollaborationConfigEditor, TeamLevelConfig } from './components/CollaborationConfigEditor';
import type { TeamMember, TeamCollaborationConfig, AgentTeamConfig } from '@trading-agent/shared';

export default function TeamEditPage() {
  const { teamId } = useParams();
  const navigate = useNavigate();
  const isEditing = !!teamId && teamId !== 'create';

  const { data: agentsData, isLoading: agentsLoading, error: agentsError } = useAgentConfigs();
  const { data: teamData } = useTeamConfig(isEditing ? teamId! : null);
  const createTeam = useCreateTeam();
  const updateTeam = useUpdateTeam();

  const agents = (agentsData?.agents ?? []).map(a => ({
    id: a.id,
    name: a.name,
    description: a.description,
    metadata: a.metadata,
  }));

  // 表单状态
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [supervisorAgentId, setSupervisorAgentId] = useState<string | undefined>();
  const [collaboration, setCollaboration] = useState<TeamCollaborationConfig>({
    pattern: 'council',
    rounds: 1,
    passThroughContext: true,
  });
  const [teamInstructions, setTeamInstructions] = useState<string | undefined>();
  const [sharedContext, setSharedContext] = useState<string | undefined>();
  const [outputFormat, setOutputFormat] = useState<'research-report' | 'summary' | 'custom'>('research-report');
  const [sharedMemoryEnabled, setSharedMemoryEnabled] = useState(false);
  const [defaultTarget, setDefaultTarget] = useState<string | undefined>();
  const [customOutputSchema, setCustomOutputSchema] = useState<string | undefined>();
  const [tags, setTags] = useState<string[]>([]);
  const [tagsInput, setTagsInput] = useState('');

  // 加载已有数据
  useEffect(() => {
    if (teamData?.team) {
      const t = teamData.team;
      setName(t.name);
      setDescription(t.description);
      setMembers(t.members);
      setSupervisorAgentId(t.supervisorAgentId);
      setCollaboration(t.collaboration);
      setTeamInstructions(t.teamInstructions);
      setSharedContext(t.sharedContext);
      setOutputFormat(t.outputFormat);
      setSharedMemoryEnabled(t.sharedMemoryEnabled);
      setDefaultTarget(t.defaultTarget);
      setCustomOutputSchema(t.customOutputSchema);
      setTags(t.tags ?? []);
      setTagsInput((t.tags ?? []).join(', '));
    }
  }, [teamData]);

  const handleTeamLevelChange = (updates: Record<string, any>) => {
    if ('teamInstructions' in updates) setTeamInstructions(updates.teamInstructions);
    if ('sharedContext' in updates) setSharedContext(updates.sharedContext);
    if ('outputFormat' in updates) setOutputFormat(updates.outputFormat);
    if ('sharedMemoryEnabled' in updates) setSharedMemoryEnabled(updates.sharedMemoryEnabled);
    if ('defaultTarget' in updates) setDefaultTarget(updates.defaultTarget);
    if ('customOutputSchema' in updates) setCustomOutputSchema(updates.customOutputSchema);
  };

  const handleSave = async () => {
    if (!name.trim()) {
      alert('请输入团队名称');
      return;
    }
    if (members.length === 0) {
      alert('请至少选择一个成员');
      return;
    }

    const parsedTags = tagsInput.split(',').map(s => s.trim()).filter(Boolean);

    const config: Omit<AgentTeamConfig, 'createdAt' | 'updatedAt' | 'isTemplate'> = {
      id: isEditing ? teamId! : `team-${Date.now().toString(36)}`,
      name: name.trim(),
      description: description.trim(),
      members,
      supervisorAgentId,
      collaboration,
      teamInstructions,
      sharedContext,
      outputFormat,
      customOutputSchema,
      sharedMemoryEnabled,
      defaultTarget,
      tags: parsedTags,
    };

    try {
      if (isEditing) {
        await updateTeam.mutateAsync({ id: teamId!, updates: config });
      } else {
        await createTeam.mutateAsync(config);
      }
      navigate('/teams');
    } catch (err) {
      alert(`保存失败: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  return (
    <PageLayout className="gap-4 p-4">
      {/* 顶部操作栏 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate('/teams')}>
            <ArrowLeft className="mr-1 size-4" />
            返回
          </Button>
          <h1 className="font-display text-xl font-bold text-neutral6">
            {isEditing ? '编辑团队' : '创建团队'}
          </h1>
        </div>
        <Button onClick={handleSave} disabled={createTeam.isPending || updateTeam.isPending}>
          <Save className="mr-1 size-4" />
          保存
        </Button>
      </div>

      {/* 基本信息表单 */}
      <div className="space-y-3 rounded-lg border border-border1 bg-surface3 p-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-neutral3">团队名称 *</label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="如 深度投研组"
            className="w-full rounded border border-border1 bg-surface2 px-3 py-2 text-sm text-neutral5 placeholder:text-neutral4"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-neutral3">团队描述</label>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            rows={2}
            placeholder="团队用途描述..."
            className="w-full rounded border border-border1 bg-surface2 px-3 py-2 text-sm text-neutral5 placeholder:text-neutral4"
          />
        </div>
      </div>

      {/* 两栏布局：成员 + 配置 */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* 左侧：成员管理 */}
        <div className="space-y-3 rounded-lg border border-border1 bg-surface3 p-4">
          <div>
            <h3 className="font-display text-sm font-semibold text-neutral6">团队成员</h3>
            <p className="mt-0.5 text-xs text-neutral3">选择 Agent 并配置角色、权重、阵营</p>
          </div>

          {/* Supervisor 选择 */}
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral3">Supervisor Agent（可选）</label>
            <select
              value={supervisorAgentId ?? ''}
              onChange={e => setSupervisorAgentId(e.target.value || undefined)}
              className="w-full rounded border border-border1 bg-surface2 px-2 py-1.5 text-sm text-neutral5"
            >
              <option value="">自动（使用 leader 角色）</option>
              {agents.map(a => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </div>

          {agentsLoading ? (
            <div className="flex h-32 items-center justify-center gap-2 text-sm text-neutral3">
              <Loader2 className="size-4 animate-spin" />
              加载 Agent 列表...
            </div>
          ) : agentsError ? (
            <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-500">
              <AlertCircle className="size-4 shrink-0" />
              <span>Agent 列表加载失败: {agentsError.message}</span>
            </div>
          ) : agents.length === 0 ? (
            <div className="flex h-32 items-center justify-center text-sm text-neutral3">
              暂无可用 Agent，请先在 Agent 配置页面创建
            </div>
          ) : (
            <TeamMemberPicker
              agents={agents}
              members={members}
              onChange={setMembers}
              pattern={collaboration.pattern}
            />
          )}
        </div>

        {/* 右侧：协作配置 + 团队级配置 */}
        <div className="space-y-4 rounded-lg border border-border1 bg-surface3 p-4">
          <div>
            <h3 className="font-display text-sm font-semibold text-neutral6">协作配置</h3>
            <p className="mt-0.5 text-xs text-neutral3">选择协作模式并配置参数</p>
          </div>
          <CollaborationConfigEditor
            config={collaboration}
            onChange={setCollaboration}
          />

          <div className="border-t border-border1 pt-4">
            <h3 className="mb-3 font-display text-sm font-semibold text-neutral6">团队级配置</h3>
            <TeamLevelConfig
              teamInstructions={teamInstructions}
              sharedContext={sharedContext}
              outputFormat={outputFormat}
              sharedMemoryEnabled={sharedMemoryEnabled}
              defaultTarget={defaultTarget}
              customOutputSchema={customOutputSchema}
              onChange={handleTeamLevelChange}
            />
          </div>

          {/* 标签 */}
          <div className="border-t border-border1 pt-4">
            <label className="mb-1 block text-xs font-medium text-neutral3">标签（逗号分隔）</label>
            <input
              type="text"
              value={tagsInput}
              onChange={e => setTagsInput(e.target.value)}
              placeholder="投研, 深度分析"
              className="w-full rounded border border-border1 bg-surface2 px-3 py-1.5 text-sm text-neutral5 placeholder:text-neutral4"
            />
          </div>
        </div>
      </div>
    </PageLayout>
  );
}
