import { Button } from '@mastra/playground-ui/components/Button';
import { Loader2, Save, X } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from '@mastra/playground-ui/utils/toast';
import type { ToolConfig, ToolCategory, CreateToolConfigInput } from '@trading-agent/shared';
import { useCreateTool, useUpdateTool } from '@/lib/tool-api';

interface ToolEditDialogProps {
  tool: ToolConfig | null;
  onClose: () => void;
}

const CATEGORIES: ToolCategory[] = [
  'market-data',
  'technical-analysis',
  'news-sentiment',
  'fundamentals',
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

export function ToolEditDialog({ tool, onClose }: ToolEditDialogProps) {
  const { t } = useTranslation(['tools', 'common']);
  const isEditing = !!tool;
  const createTool = useCreateTool();
  const updateTool = useUpdateTool();

  // 表单状态
  const [id, setId] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<ToolCategory>('custom');
  const [enabled, setEnabled] = useState(true);
  const [inputSchema, setInputSchema] = useState('');
  const [outputSchema, setOutputSchema] = useState('');
  const [config, setConfig] = useState('');
  const [jsonErrors, setJsonErrors] = useState<Record<string, boolean>>({});

  // 加载已有数据
  useEffect(() => {
    if (tool) {
      setId(tool.id);
      setName(tool.name);
      setDescription(tool.description);
      setCategory(tool.category);
      setEnabled(tool.enabled);
      setInputSchema(tool.inputSchema ?? '');
      setOutputSchema(tool.outputSchema ?? '');
      setConfig(tool.config ? JSON.stringify(tool.config, null, 2) : '');
    } else {
      setId('');
      setName('');
      setDescription('');
      setCategory('custom');
      setEnabled(true);
      setInputSchema('');
      setOutputSchema('');
      setConfig('');
    }
    setJsonErrors({});
  }, [tool]);

  const validateJsonField = (field: string, value: string): boolean => {
    if (!value.trim()) return true; // 空值合法
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
      toast.error(t('tools:edit.idRequired'));
      return;
    }
    if (!name.trim()) {
      toast.error(t('tools:edit.nameRequired'));
      return;
    }

    // 验证 JSON 字段
    const errors: Record<string, boolean> = {};
    if (!validateJsonField('inputSchema', inputSchema)) errors.inputSchema = true;
    if (!validateJsonField('outputSchema', outputSchema)) errors.outputSchema = true;
    if (!validateJsonField('config', config)) errors.config = true;

    if (Object.keys(errors).length > 0) {
      setJsonErrors(errors);
      toast.error(t('tools:edit.invalidJson'));
      return;
    }

    const parsedInputSchema = tryParseJson(inputSchema);
    const parsedOutputSchema = tryParseJson(outputSchema);
    let parsedConfig: Record<string, any> | undefined;
    if (config.trim()) {
      try {
        parsedConfig = JSON.parse(config);
      } catch {
        // already validated above
      }
    }

    try {
      if (isEditing) {
        await updateTool.mutateAsync({
          id: tool!.id,
          updates: {
            name: name.trim(),
            description: description.trim(),
            category,
            enabled,
            inputSchema: parsedInputSchema,
            outputSchema: parsedOutputSchema,
            config: parsedConfig,
          },
        });
      } else {
        const input: CreateToolConfigInput = {
          id: id.trim(),
          name: name.trim(),
          description: description.trim(),
          category,
          enabled,
          inputSchema: parsedInputSchema,
          outputSchema: parsedOutputSchema,
          config: parsedConfig ?? {},
        };
        await createTool.mutateAsync(input);
      }
      toast.success(t('tools:edit.saved'));
      onClose();
    } catch (err) {
      toast.error(
        t('tools:edit.saveFailed', {
          error: err instanceof Error ? err.message : String(err),
        }),
      );
    }
  };

  const isSaving = createTool.isPending || updateTool.isPending;

  // ── JSON textarea 样式 ────────────────────────────────────────────────
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
            {isEditing ? t('tools:edit.title') : t('tools:edit.createTitle')}
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
                {t('tools:edit.id')}
              </label>
              <input
                type="text"
                value={id}
                onChange={e => setId(e.target.value)}
                placeholder={t('tools:edit.idPlaceholder')}
                disabled={isEditing}
                className="w-full rounded border border-border1 bg-surface2 px-3 py-2 text-sm text-neutral5 placeholder:text-neutral4 disabled:opacity-50 focus:border-accent1 focus:outline-none"
              />
              {!isEditing && (
                <p className="mt-0.5 text-[10px] text-neutral4">{t('tools:edit.idHint')}</p>
              )}
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral3">
                {t('tools:edit.name')}
              </label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder={t('tools:edit.namePlaceholder')}
                className="w-full rounded border border-border1 bg-surface2 px-3 py-2 text-sm text-neutral5 placeholder:text-neutral4 focus:border-accent1 focus:outline-none"
              />
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral3">
              {t('tools:edit.description')}
            </label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={2}
              placeholder={t('tools:edit.descriptionPlaceholder')}
              className="w-full rounded border border-border1 bg-surface2 px-3 py-2 text-sm text-neutral5 placeholder:text-neutral4 focus:border-accent1 focus:outline-none"
            />
          </div>

          {/* Category + Enabled */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral3">
                {t('tools:edit.category')}
              </label>
              <select
                value={category}
                onChange={e => setCategory(e.target.value as ToolCategory)}
                className="w-full rounded border border-border1 bg-surface2 px-2 py-2 text-sm text-neutral5 focus:border-accent1 focus:outline-none"
              >
                {CATEGORIES.map(cat => (
                  <option key={cat} value={cat}>
                    {t(`tools:categories.${cat}`)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral3">
                {t('tools:edit.enabled')}
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
                <span className="text-xs text-neutral4">{t('tools:edit.enabledHint')}</span>
              </div>
            </div>
          </div>

          {/* Input Schema */}
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral3">
              {t('tools:edit.inputSchema')}
            </label>
            <textarea
              value={inputSchema}
              onChange={e => {
                setInputSchema(e.target.value);
                setJsonErrors(prev => ({ ...prev, inputSchema: false }));
              }}
              rows={4}
              placeholder={t('tools:edit.inputSchemaPlaceholder')}
              className={jsonTextareaClass(jsonErrors.inputSchema)}
            />
            {jsonErrors.inputSchema && (
              <p className="mt-0.5 text-[10px] text-red-400">{t('tools:edit.invalidJson')}</p>
            )}
          </div>

          {/* Output Schema */}
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral3">
              {t('tools:edit.outputSchema')}
            </label>
            <textarea
              value={outputSchema}
              onChange={e => {
                setOutputSchema(e.target.value);
                setJsonErrors(prev => ({ ...prev, outputSchema: false }));
              }}
              rows={4}
              placeholder={t('tools:edit.outputSchemaPlaceholder')}
              className={jsonTextareaClass(jsonErrors.outputSchema)}
            />
            {jsonErrors.outputSchema && (
              <p className="mt-0.5 text-[10px] text-red-400">{t('tools:edit.invalidJson')}</p>
            )}
          </div>

          {/* Config */}
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral3">
              {t('tools:edit.config')}
            </label>
            <textarea
              value={config}
              onChange={e => {
                setConfig(e.target.value);
                setJsonErrors(prev => ({ ...prev, config: false }));
              }}
              rows={3}
              placeholder={t('tools:edit.configPlaceholder')}
              className={jsonTextareaClass(jsonErrors.config)}
            />
            {jsonErrors.config && (
              <p className="mt-0.5 text-[10px] text-red-400">{t('tools:edit.invalidJson')}</p>
            )}
          </div>
        </div>

        {/* 底部操作栏 */}
        <div className="flex items-center justify-end gap-2 border-t border-border1 px-5 py-3">
          <Button variant="ghost" size="sm" onClick={onClose}>
            {t('tools:edit.cancel')}
          </Button>
          <Button size="sm" onClick={handleSave} disabled={isSaving}>
            {isSaving ? (
              <>
                <Loader2 className="mr-1 size-4 animate-spin" />
                {t('tools:edit.saving')}
              </>
            ) : (
              <>
                <Save className="mr-1 size-4" />
                {t('tools:edit.save')}
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
