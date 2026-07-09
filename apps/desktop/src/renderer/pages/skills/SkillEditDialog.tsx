import { Button } from '@mastra/playground-ui/components/Button';
import { Loader2, Save, X, Plus, Trash2 } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from '@mastra/playground-ui/utils/toast';
import type { SkillConfig, SkillCategory, CreateSkillConfigInput } from '@trading-agent/shared';
import { useCreateSkill, useUpdateSkill } from '@/lib/skill-api';

interface SkillEditDialogProps {
  skill: SkillConfig | null;
  onClose: () => void;
}

const CATEGORIES: SkillCategory[] = [
  'research',
  'analysis',
  'trading',
  'risk-management',
  'custom',
];

function tryParseJson(str: string | undefined): string | undefined {
  if (!str || !str.trim()) return undefined;
  try {
    JSON.parse(str);
    return str.trim();
  } catch {
    return null; // invalid
  }
}

export function SkillEditDialog({ skill, onClose }: SkillEditDialogProps) {
  const { t } = useTranslation(['skills', 'common']);
  const isEditing = !!skill;
  const createSkill = useCreateSkill();
  const updateSkill = useUpdateSkill();

  // 表单状态
  const [id, setId] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<SkillCategory>('custom');
  const [enabled, setEnabled] = useState(true);
  const [content, setContent] = useState('');
  const [triggers, setTriggers] = useState<string[]>([]);
  const [triggerInput, setTriggerInput] = useState('');
  const [config, setConfig] = useState('');
  const [jsonError, setJsonError] = useState(false);

  // 加载已有数据
  useEffect(() => {
    if (skill) {
      setId(skill.id);
      setName(skill.name);
      setDescription(skill.description);
      setCategory(skill.category);
      setEnabled(skill.enabled);
      setContent(skill.content ?? '');
      setTriggers(skill.triggers ?? []);
      setConfig(skill.config ? JSON.stringify(skill.config, null, 2) : '');
    } else {
      setId('');
      setName('');
      setDescription('');
      setCategory('custom');
      setEnabled(true);
      setContent('');
      setTriggers([]);
      setConfig('');
    }
    setJsonError(false);
    setTriggerInput('');
  }, [skill]);

  const handleAddTrigger = () => {
    const trimmed = triggerInput.trim();
    if (trimmed && !triggers.includes(trimmed)) {
      setTriggers([...triggers, trimmed]);
      setTriggerInput('');
    }
  };

  const handleRemoveTrigger = (trigger: string) => {
    setTriggers(triggers.filter(t => t !== trigger));
  };

  const handleTriggerKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddTrigger();
    }
  };

  const validateJsonField = (value: string): boolean => {
    if (!value.trim()) return true;
    try {
      JSON.parse(value);
      return true;
    } catch {
      return false;
    }
  };

  const handleSave = async () => {
    // 验证必填字段
    if (!id.trim()) {
      toast.error(t('skills:edit.idRequired'));
      return;
    }
    if (!name.trim()) {
      toast.error(t('skills:edit.nameRequired'));
      return;
    }

    // 验证 JSON 字段
    if (!validateJsonField(config)) {
      setJsonError(true);
      toast.error(t('skills:edit.invalidJson'));
      return;
    }

    const parsedConfig = tryParseJson(config);
    let parsedConfigObj: Record<string, any> | undefined;
    if (parsedConfig) {
      try {
        parsedConfigObj = JSON.parse(parsedConfig);
      } catch {
        // already validated above
      }
    }

    try {
      if (isEditing) {
        await updateSkill.mutateAsync({
          id: skill!.id,
          updates: {
            name: name.trim(),
            description: description.trim(),
            category,
            enabled,
            content: content.trim(),
            triggers,
            config: parsedConfigObj,
          },
        });
      } else {
        const input: CreateSkillConfigInput = {
          id: id.trim(),
          name: name.trim(),
          description: description.trim(),
          category,
          enabled,
          content: content.trim(),
          triggers,
          config: parsedConfigObj ?? {},
        };
        await createSkill.mutateAsync(input);
      }
      toast.success(t('skills:edit.saved'));
      onClose();
    } catch (err) {
      toast.error(
        t('skills:edit.saveFailed', {
          error: err instanceof Error ? err.message : String(err),
        }),
      );
    }
  };

  const isSaving = createSkill.isPending || updateSkill.isPending;

  const jsonTextareaClass = (hasError: boolean) =>
    `w-full rounded border bg-surface2 px-3 py-2 font-mono text-xs text-neutral5 placeholder:text-neutral4 focus:outline-none ${
      hasError ? 'border-red-500 focus:border-red-500' : 'border-border1 focus:border-accent1'
    }`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-border1 bg-surface1 shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* 头部 */}
        <div className="flex items-center justify-between border-b border-border1 px-5 py-3">
          <h2 className="font-display text-base font-semibold text-neutral6">
            {isEditing ? t('skills:edit.title') : t('skills:edit.createTitle')}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-neutral4 hover:bg-surface3 hover:text-neutral5"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* 表单内容 */}
        <div className="space-y-4 p-5">
          {/* ID + Name */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral3">
                {t('skills:edit.id')}
              </label>
              <input
                type="text"
                value={id}
                onChange={e => setId(e.target.value)}
                placeholder={t('skills:edit.idPlaceholder')}
                disabled={isEditing}
                className="w-full rounded border border-border1 bg-surface2 px-3 py-2 text-sm text-neutral5 placeholder:text-neutral4 disabled:opacity-50 focus:border-accent1 focus:outline-none"
              />
              {!isEditing && (
                <p className="mt-0.5 text-[10px] text-neutral4">{t('skills:edit.idHint')}</p>
              )}
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral3">
                {t('skills:edit.name')}
              </label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder={t('skills:edit.namePlaceholder')}
                className="w-full rounded border border-border1 bg-surface2 px-3 py-2 text-sm text-neutral5 placeholder:text-neutral4 focus:border-accent1 focus:outline-none"
              />
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral3">
              {t('skills:edit.description')}
            </label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={2}
              placeholder={t('skills:edit.descriptionPlaceholder')}
              className="w-full rounded border border-border1 bg-surface2 px-3 py-2 text-sm text-neutral5 placeholder:text-neutral4 focus:border-accent1 focus:outline-none"
            />
          </div>

          {/* Category + Enabled */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral3">
                {t('skills:edit.category')}
              </label>
              <select
                value={category}
                onChange={e => setCategory(e.target.value as SkillCategory)}
                className="w-full rounded border border-border1 bg-surface2 px-2 py-2 text-sm text-neutral5 focus:border-accent1 focus:outline-none"
              >
                {CATEGORIES.map(cat => (
                  <option key={cat} value={cat}>
                    {t(`skills:categories.${cat}`)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral3">
                {t('skills:edit.enabled')}
              </label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setEnabled(!enabled)}
                  className={`relative h-6 w-11 rounded-full transition-colors ${
                    enabled ? 'bg-accent1' : 'bg-surface4'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 size-5 rounded-full bg-white transition-transform ${
                      enabled ? 'translate-x-5' : 'translate-x-0.5'
                    }`}
                  />
                </button>
                <span className="text-xs text-neutral4">{t('skills:edit.enabledHint')}</span>
              </div>
            </div>
          </div>

          {/* Content (Prompt) */}
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral3">
              {t('skills:edit.content')}
            </label>
            <textarea
              value={content}
              onChange={e => setContent(e.target.value)}
              rows={6}
              placeholder={t('skills:edit.contentPlaceholder')}
              className="w-full rounded border border-border1 bg-surface2 px-3 py-2 text-sm text-neutral5 placeholder:text-neutral4 focus:border-accent1 focus:outline-none"
            />
          </div>

          {/* Triggers */}
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral3">
              {t('skills:edit.triggers')}
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={triggerInput}
                onChange={e => setTriggerInput(e.target.value)}
                onKeyDown={handleTriggerKeyDown}
                placeholder={t('skills:edit.triggersPlaceholder')}
                className="flex-1 rounded border border-border1 bg-surface2 px-3 py-2 text-sm text-neutral5 placeholder:text-neutral4 focus:border-accent1 focus:outline-none"
              />
              <Button
                size="sm"
                variant="outline"
                onClick={handleAddTrigger}
                disabled={!triggerInput.trim()}
              >
                <Plus className="size-4" />
              </Button>
            </div>
            <p className="mt-0.5 text-[10px] text-neutral4">{t('skills:edit.triggersHint')}</p>
            {triggers.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {triggers.map(trigger => (
                  <span
                    key={trigger}
                    className="inline-flex items-center gap-1 rounded border border-border1 bg-surface3 px-2 py-0.5 text-xs text-neutral4"
                  >
                    {trigger}
                    <button
                      type="button"
                      onClick={() => handleRemoveTrigger(trigger)}
                      className="text-neutral4 hover:text-red-400"
                    >
                      <Trash2 className="size-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Config */}
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral3">
              {t('skills:edit.config')}
            </label>
            <textarea
              value={config}
              onChange={e => {
                setConfig(e.target.value);
                setJsonError(false);
              }}
              rows={3}
              placeholder={t('skills:edit.configPlaceholder')}
              className={jsonTextareaClass(jsonError)}
            />
            {jsonError && (
              <p className="mt-0.5 text-[10px] text-red-400">{t('skills:edit.invalidJson')}</p>
            )}
          </div>
        </div>

        {/* 底部操作栏 */}
        <div className="flex items-center justify-end gap-2 border-t border-border1 px-5 py-3">
          <Button variant="ghost" size="sm" onClick={onClose}>
            {t('skills:edit.cancel')}
          </Button>
          <Button size="sm" onClick={handleSave} disabled={isSaving}>
            {isSaving ? (
              <>
                <Loader2 className="mr-1 size-4 animate-spin" />
                {t('skills:edit.saving')}
              </>
            ) : (
              <>
                <Save className="mr-1 size-4" />
                {t('skills:edit.save')}
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
