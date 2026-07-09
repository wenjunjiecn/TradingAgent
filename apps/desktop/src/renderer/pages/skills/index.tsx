import { Button } from '@mastra/playground-ui/components/Button';
import { PageLayout } from '@mastra/playground-ui/components/PageLayout';
import {
  Plus,
  Search,
  Pencil,
  Trash2,
  Sparkles,
  Loader2,
  Power,
  AlertCircle,
  Tag,
} from 'lucide-react';
import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { SkillConfig, SkillCategory } from '@trading-agent/shared';
import { useSkillConfigs, useDeleteSkill, useUpdateSkill } from '@/lib/skill-api';
import { SkillEditDialog } from './SkillEditDialog';

// ── 分类图标/颜色映射 ──────────────────────────────────────────────────
const CATEGORY_COLORS: Record<SkillCategory, string> = {
  'research': 'text-blue-400 bg-blue-500/10 border-blue-500/20',
  'analysis': 'text-purple-400 bg-purple-500/10 border-purple-500/20',
  'trading': 'text-orange-400 bg-orange-500/10 border-orange-500/20',
  'risk-management': 'text-red-400 bg-red-500/10 border-red-500/20',
  'custom': 'text-neutral4 bg-surface4 border-border1',
};

export default function Skills() {
  const { t } = useTranslation(['skills', 'common']);
  const { data: skillsData, isLoading, error } = useSkillConfigs();
  const deleteSkill = useDeleteSkill();
  const updateSkill = useUpdateSkill();

  const [search, setSearch] = useState('');
  const [editSkill, setEditSkill] = useState<SkillConfig | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const skills = skillsData?.skills ?? [];

  const filteredSkills = useMemo(() => {
    if (!search.trim()) return skills;
    const q = search.toLowerCase();
    return skills.filter(
      skill =>
        skill.name.toLowerCase().includes(q) ||
        skill.description.toLowerCase().includes(q) ||
        skill.id.toLowerCase().includes(q),
    );
  }, [skills, search]);

  const handleDelete = async (skill: SkillConfig) => {
    if (skill.isBuiltin) return;
    if (confirm(t('skills:list.deleteConfirm', { name: skill.name }))) {
      try {
        await deleteSkill.mutateAsync(skill.id);
      } catch (err) {
        alert(err instanceof Error ? err.message : String(err));
      }
    }
  };

  const handleToggleEnabled = async (skill: SkillConfig) => {
    try {
      await updateSkill.mutateAsync({
        id: skill.id,
        updates: { enabled: !skill.enabled },
      });
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    }
  };

  // ── 加载状态 ──────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <PageLayout className="gap-4 p-4">
        <div className="flex h-64 items-center justify-center gap-2 text-sm text-neutral3">
          <Loader2 className="size-5 animate-spin" />
          {t('skills:list.loading')}
        </div>
      </PageLayout>
    );
  }

  // ── 错误状态 ──────────────────────────────────────────────────────────
  if (error) {
    return (
      <PageLayout className="gap-4 p-4">
        <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/5 p-4 text-sm text-red-500">
          <AlertCircle className="size-5 shrink-0" />
          <span>{error.message}</span>
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout className="gap-4 p-4">
      {/* 标题栏 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-xl font-bold text-neutral6">
            {t('skills:list.title')}
          </h1>
          <p className="text-sm text-neutral3">{t('skills:list.subtitle')}</p>
        </div>
        <Button size="sm" onClick={() => setShowCreate(true)}>
          <Plus className="mr-1 size-4" />
          {t('skills:list.create')}
        </Button>
      </div>

      {/* 搜索栏 */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-neutral4" />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder={t('skills:list.searchPlaceholder')}
          className="w-full rounded-lg border border-border1 bg-surface2 py-2 pl-9 pr-3 text-sm text-neutral5 placeholder:text-neutral4 focus:border-accent1 focus:outline-none"
        />
      </div>

      {/* 技能卡片网格 */}
      {filteredSkills.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 py-16">
          <Sparkles className="size-12 text-neutral4" />
          <p className="text-sm text-neutral3">
            {search ? t('skills:list.noMatch') : t('skills:list.empty')}
          </p>
          {!search && (
            <Button size="sm" onClick={() => setShowCreate(true)}>
              <Plus className="mr-1 size-4" />
              {t('skills:list.create')}
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-3">
          {filteredSkills.map(skill => {
            const categoryColor = CATEGORY_COLORS[skill.category] ?? CATEGORY_COLORS.custom;
            return (
              <div
                key={skill.id}
                className={`flex flex-col gap-3 rounded-xl border bg-surface3 p-4 transition-colors hover:border-border2 ${
                  skill.enabled ? 'border-border1' : 'border-border1 opacity-60'
                }`}
              >
                {/* 头部 */}
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="truncate font-display text-sm font-semibold text-neutral6">
                        {skill.name}
                      </h3>
                      {skill.isBuiltin ? (
                        <span className="shrink-0 rounded border border-border1 bg-surface4 px-1.5 py-0.5 text-[10px] font-medium text-neutral3">
                          {t('skills:list.builtin')}
                        </span>
                      ) : (
                        <span className="shrink-0 rounded border border-accent1/30 bg-accent1/10 px-1.5 py-0.5 text-[10px] font-medium text-accent1">
                          {t('skills:list.custom')}
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 line-clamp-2 text-xs text-neutral3">
                      {skill.description || '—'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleToggleEnabled(skill)}
                    title={t('skills:list.toggleEnabled')}
                    className={`flex shrink-0 items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-medium transition-colors ${
                      skill.enabled
                        ? 'border-green-500/20 bg-green-500/10 text-green-400 hover:bg-green-500/20'
                        : 'border-border1 bg-surface4 text-neutral4 hover:bg-surface2'
                    }`}
                  >
                    <Power className="size-3" />
                    {skill.enabled ? t('skills:list.enabled') : t('skills:list.disabled')}
                  </button>
                </div>

                {/* 分类标签 */}
                <div className="flex items-center gap-2">
                  <span
                    className={`rounded border px-1.5 py-0.5 text-[10px] font-medium ${categoryColor}`}
                  >
                    {t(`skills:categories.${skill.category}`)}
                  </span>
                  <span className="text-[10px] text-neutral4 font-mono">{skill.id}</span>
                </div>

                {/* 触发词 */}
                {skill.triggers && skill.triggers.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1">
                    <Tag className="size-3 shrink-0 text-neutral4" />
                    <span className="text-[10px] text-neutral4">{t('skills:list.triggersLabel')}:</span>
                    {skill.triggers.slice(0, 4).map(trigger => (
                      <span
                        key={trigger}
                        className="rounded bg-surface4 px-1.5 py-0.5 text-[10px] text-neutral3"
                      >
                        {trigger}
                      </span>
                    ))}
                    {skill.triggers.length > 4 && (
                      <span className="text-[10px] text-neutral4">+{skill.triggers.length - 4}</span>
                    )}
                  </div>
                )}

                {/* 提示词预览 */}
                {skill.content && (
                  <p className="line-clamp-2 text-[11px] leading-relaxed text-neutral4">
                    {skill.content}
                  </p>
                )}

                {/* 操作按钮 */}
                <div className="mt-auto flex items-center gap-2 pt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setEditSkill(skill)}
                  >
                    <Pencil className="mr-1 size-3.5" />
                    {t('skills:list.editButton')}
                  </Button>
                  {!skill.isBuiltin && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDelete(skill)}
                      className="ml-auto text-red-400 hover:bg-red-500/10"
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 创建/编辑对话框 */}
      {showCreate && (
        <SkillEditDialog
          skill={null}
          onClose={() => setShowCreate(false)}
        />
      )}
      {editSkill && (
        <SkillEditDialog
          skill={editSkill}
          onClose={() => setEditSkill(null)}
        />
      )}
    </PageLayout>
  );
}
