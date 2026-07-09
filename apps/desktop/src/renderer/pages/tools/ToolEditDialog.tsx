import { Button } from '@mastra/playground-ui/components/Button';
import { Loader2, Save, X, AlertCircle, Plus, Trash2 } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from '@mastra/playground-ui/utils/toast';
import type { ToolConfig, ToolCategory, ToolType, CreateToolConfigInput } from '@trading-agent/shared';
import { useCreateTool, useUpdateTool } from '@/lib/tool-api';

// ── 常量 ─────────────────────────────────────────────────────────────

const CATEGORIES: ToolCategory[] = [
  'market-data',
  'technical-analysis',
  'news-sentiment',
  'fundamentals',
  'custom',
];

const TOOL_TYPES: ToolType[] = ['builtin', 'http', 'mcp', 'code'];

const HTTP_METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'] as const;

// ── 默认配置模板 ─────────────────────────────────────────────────────

const DEFAULT_HTTP_CONFIG = {
  url: '',
  method: 'GET',
  headers: {} as Record<string, string>,
  pathParams: {} as Record<string, string>,
  queryParams: {} as Record<string, string>,
  bodyTemplate: '',
  timeoutMs: 12000,
  responsePath: '',
};

const DEFAULT_MCP_CONFIG = {
  serverUrl: '',
  serverName: '',
  remoteToolName: '',
  authToken: '',
};

const DEFAULT_CODE_CONFIG = {
  code: `// input 是工具输入参数对象
// 可用全局: fetch, JSON, Math, Date, console, URL 等
// 必须返回结果 (支持 async/await)

const symbol = input.symbol || 'AAPL';
const res = await fetch(\`https://api.example.com/quote?symbol=\${symbol}\`);
const data = await res.json();
return data;
`,
  timeoutMs: 15000,
  env: {} as Record<string, string>,
};

const DEFAULT_INPUT_SCHEMA = {
  type: 'object',
  properties: {
    symbol: { type: 'string', description: '股票代码' },
  },
  required: ['symbol'],
};

// ── 辅助组件: 键值对编辑器 ───────────────────────────────────────────

interface KeyValueEditorProps {
  pairs: Record<string, string>;
  onChange: (pairs: Record<string, string>) => void;
  keyPlaceholder?: string;
  valuePlaceholder?: string;
  disabled?: boolean;
}

function KeyValueEditor({ pairs, onChange, keyPlaceholder = 'Key', valuePlaceholder = 'Value', disabled }: KeyValueEditorProps) {
  const entries = Object.entries(pairs);

  const handleAdd = () => {
    onChange({ ...pairs, '': '' });
  };

  const handleRemove = (key: string) => {
    const next = { ...pairs };
    delete next[key];
    onChange(next);
  };

  const handleChange = (oldKey: string, newKey: string, value: string) => {
    const next = { ...pairs };
    delete next[oldKey];
    next[newKey] = value;
    onChange(next);
  };

  return (
    <div className="space-y-2">
      {entries.map(([key, value], idx) => (
        <div key={idx} className="flex items-center gap-2">
          <input
            type="text"
            value={key}
            onChange={e => handleChange(key, e.target.value, value)}
            placeholder={keyPlaceholder}
            disabled={disabled}
            className="flex-1 rounded border border-border1 bg-surface2 px-2 py-1.5 text-xs text-neutral5 placeholder:text-neutral4 focus:border-accent1 focus:outline-none"
          />
          <input
            type="text"
            value={value}
            onChange={e => handleChange(key, e.target.value)}
            placeholder={valuePlaceholder}
            disabled={disabled}
            className="flex-1 rounded border border-border1 bg-surface2 px-2 py-1.5 text-xs text-neutral5 placeholder:text-neutral4 focus:border-accent1 focus:outline-none"
          />
          {!disabled && (
            <button
              type="button"
              onClick={() => handleRemove(key)}
              className="shrink-0 rounded p-1 text-neutral4 hover:bg-red-500/10 hover:text-red-400"
            >
              <Trash2 className="size-3.5" />
            </button>
          )}
        </div>
      ))}
      {!disabled && (
        <button
          type="button"
          onClick={handleAdd}
          className="flex items-center gap-1 text-xs text-accent1 hover:text-accent2"
        >
          <Plus className="size-3.5" />
          添加
        </button>
      )}
    </div>
  );
}

// ── HTTP 配置表单 ────────────────────────────────────────────────────

interface HttpConfigFormProps {
  config: typeof DEFAULT_HTTP_CONFIG;
  onChange: (config: typeof DEFAULT_HTTP_CONFIG) => void;
  disabled?: boolean;
}

function HttpConfigForm({ config, onChange, disabled }: HttpConfigFormProps) {
  const { t } = useTranslation('tools');

  const update = (patch: Partial<typeof DEFAULT_HTTP_CONFIG>) => {
    onChange({ ...config, ...patch });
  };

  const inputClass = 'w-full rounded border border-border1 bg-surface2 px-3 py-2 text-sm text-neutral5 placeholder:text-neutral4 focus:border-accent1 focus:outline-none disabled:opacity-60 disabled:cursor-not-allowed';
  const labelClass = 'mb-1 block text-xs font-medium text-neutral3';

  return (
    <div className="space-y-3 rounded-lg border border-border1 bg-surface3 p-4">
      {/* URL + Method */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[120px_1fr]">
        <div>
          <label className={labelClass}>{t('edit.httpMethod')}</label>
          <select
            value={config.method}
            onChange={e => update({ method: e.target.value as typeof config.method })}
            disabled={disabled}
            className={inputClass}
          >
            {HTTP_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
        <div>
          <label className={labelClass}>{t('edit.httpUrl')} *</label>
          <input
            type="text"
            value={config.url}
            onChange={e => update({ url: e.target.value })}
            placeholder="https://api.example.com/quote/{{input.symbol}}"
            disabled={disabled}
            className={inputClass}
          />
        </div>
      </div>

      {/* Headers */}
      <div>
        <label className={labelClass}>{t('edit.httpHeaders')}</label>
        <KeyValueEditor
          pairs={config.headers}
          onChange={headers => update({ headers })}
          keyPlaceholder="Content-Type"
          valuePlaceholder="application/json"
          disabled={disabled}
        />
      </div>

      {/* Query Params */}
      <div>
        <label className={labelClass}>{t('edit.httpQueryParams')}</label>
        <KeyValueEditor
          pairs={config.queryParams}
          onChange={queryParams => update({ queryParams })}
          keyPlaceholder="symbol"
          valuePlaceholder="{{input.symbol}}"
          disabled={disabled}
        />
      </div>

      {/* Body Template */}
      <div>
        <label className={labelClass}>{t('edit.httpBody')}</label>
        <textarea
          value={config.bodyTemplate}
          onChange={e => update({ bodyTemplate: e.target.value })}
          rows={3}
          disabled={disabled}
          placeholder={'{ "symbol": "{{input.symbol}}" }'}
          className="w-full rounded border border-border1 bg-surface2 px-3 py-2 font-mono text-xs text-neutral5 placeholder:text-neutral4 focus:border-accent1 focus:outline-none disabled:opacity-60 disabled:cursor-not-allowed"
        />
      </div>

      {/* Response Path + Timeout */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className={labelClass}>{t('edit.httpResponsePath')}</label>
          <input
            type="text"
            value={config.responsePath}
            onChange={e => update({ responsePath: e.target.value })}
            placeholder="data.result"
            disabled={disabled}
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>{t('edit.httpTimeout')}</label>
          <input
            type="number"
            value={config.timeoutMs}
            onChange={e => update({ timeoutMs: Number(e.target.value) || 12000 })}
            disabled={disabled}
            className={inputClass}
          />
        </div>
      </div>
    </div>
  );
}

// ── MCP 配置表单 ────────────────────────────────────────────────────

interface McpConfigFormProps {
  config: typeof DEFAULT_MCP_CONFIG;
  onChange: (config: typeof DEFAULT_MCP_CONFIG) => void;
  disabled?: boolean;
}

function McpConfigForm({ config, onChange, disabled }: McpConfigFormProps) {
  const { t } = useTranslation('tools');
  const update = (patch: Partial<typeof DEFAULT_MCP_CONFIG>) => onChange({ ...config, ...patch });
  const inputClass = 'w-full rounded border border-border1 bg-surface2 px-3 py-2 text-sm text-neutral5 placeholder:text-neutral4 focus:border-accent1 focus:outline-none disabled:opacity-60 disabled:cursor-not-allowed';
  const labelClass = 'mb-1 block text-xs font-medium text-neutral3';

  return (
    <div className="space-y-3 rounded-lg border border-border1 bg-surface3 p-4">
      <div>
        <label className={labelClass}>{t('edit.mcpServerUrl')} *</label>
        <input type="text" value={config.serverUrl} onChange={e => update({ serverUrl: e.target.value })} placeholder="https://mcp-server.example.com/api" disabled={disabled} className={inputClass} />
      </div>
      <div>
        <label className={labelClass}>{t('edit.mcpServerName')}</label>
        <input type="text" value={config.serverName} onChange={e => update({ serverName: e.target.value })} placeholder="my-mcp-server" disabled={disabled} className={inputClass} />
      </div>
      <div>
        <label className={labelClass}>{t('edit.mcpRemoteToolName')} *</label>
        <input type="text" value={config.remoteToolName} onChange={e => update({ remoteToolName: e.target.value })} placeholder="get_stock_data" disabled={disabled} className={inputClass} />
      </div>
      <div>
        <label className={labelClass}>{t('edit.mcpAuthToken')}</label>
        <input type="password" value={config.authToken} onChange={e => update({ authToken: e.target.value })} placeholder="Bearer token (可选)" disabled={disabled} className={inputClass} />
      </div>
    </div>
  );
}

// ── Code 配置表单 ───────────────────────────────────────────────────

interface CodeConfigFormProps {
  config: typeof DEFAULT_CODE_CONFIG;
  onChange: (config: typeof DEFAULT_CODE_CONFIG) => void;
  disabled?: boolean;
}

function CodeConfigForm({ config, onChange, disabled }: CodeConfigFormProps) {
  const { t } = useTranslation('tools');
  const update = (patch: Partial<typeof DEFAULT_CODE_CONFIG>) => onChange({ ...config, ...patch });
  const inputClass = 'w-full rounded border border-border1 bg-surface2 px-3 py-2 text-sm text-neutral5 placeholder:text-neutral4 focus:border-accent1 focus:outline-none disabled:opacity-60 disabled:cursor-not-allowed';
  const labelClass = 'mb-1 block text-xs font-medium text-neutral3';

  return (
    <div className="space-y-3 rounded-lg border border-border1 bg-surface3 p-4">
      <div>
        <label className={labelClass}>{t('edit.codeLabel')} *</label>
        <textarea
          value={config.code}
          onChange={e => update({ code: e.target.value })}
          rows={12}
          disabled={disabled}
          placeholder="// async function(input) { ... }"
          className="w-full rounded border border-border1 bg-surface2 px-3 py-2 font-mono text-xs text-neutral5 placeholder:text-neutral4 focus:border-accent1 focus:outline-none disabled:opacity-60 disabled:cursor-not-allowed"
        />
        <p className="mt-1 text-[10px] text-neutral4">{t('edit.codeHint')}</p>
      </div>
      <div>
        <label className={labelClass}>{t('edit.codeTimeout')}</label>
        <input type="number" value={config.timeoutMs} onChange={e => update({ timeoutMs: Number(e.target.value) || 15000 })} disabled={disabled} className={inputClass} />
      </div>
    </div>
  );
}

// ── 主组件 ──────────────────────────────────────────────────────────

interface ToolEditDialogProps {
  tool: ToolConfig | null;
  onClose: () => void;
}

export function ToolEditDialog({ tool, onClose }: ToolEditDialogProps) {
  const { t } = useTranslation(['tools', 'common']);
  const isEditing = !!tool;
  const createTool = useCreateTool();
  const updateTool = useUpdateTool();

  const isBuiltin = tool?.isBuiltin ?? false;

  // 基础表单状态
  const [id, setId] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<ToolCategory>('custom');
  const [type, setType] = useState<ToolType>('http');
  const [enabled, setEnabled] = useState(true);

  // Schema 状态 (JSON 文本)
  const [inputSchema, setInputSchema] = useState('');
  const [outputSchema, setOutputSchema] = useState('');
  const [jsonErrors, setJsonErrors] = useState<Record<string, boolean>>({});

  // 执行配置状态 (结构化对象)
  const [httpConfig, setHttpConfig] = useState({ ...DEFAULT_HTTP_CONFIG });
  const [mcpConfig, setMcpConfig] = useState({ ...DEFAULT_MCP_CONFIG });
  const [codeConfig, setCodeConfig] = useState({ ...DEFAULT_CODE_CONFIG });

  // 加载已有数据
  useEffect(() => {
    if (tool) {
      setId(tool.id);
      setName(tool.name);
      setDescription(tool.description);
      setCategory(tool.category);
      setType(tool.type ?? 'builtin');
      setEnabled(tool.enabled);
      setInputSchema(tool.inputSchema ? JSON.stringify(tool.inputSchema, null, 2) : '');
      setOutputSchema(tool.outputSchema ? JSON.stringify(tool.outputSchema, null, 2) : '');

      // 根据类型加载执行配置
      const cfg = tool.config ?? {};
      if (tool.type === 'http') {
        setHttpConfig({ ...DEFAULT_HTTP_CONFIG, ...cfg });
      } else if (tool.type === 'mcp') {
        setMcpConfig({ ...DEFAULT_MCP_CONFIG, ...cfg });
      } else if (tool.type === 'code') {
        setCodeConfig({ ...DEFAULT_CODE_CONFIG, ...cfg });
      }
    } else {
      // 新建默认值
      setId('');
      setName('');
      setDescription('');
      setCategory('custom');
      setType('http');
      setEnabled(true);
      setInputSchema(JSON.stringify(DEFAULT_INPUT_SCHEMA, null, 2));
      setOutputSchema('');
      setHttpConfig({ ...DEFAULT_HTTP_CONFIG });
      setMcpConfig({ ...DEFAULT_MCP_CONFIG });
      setCodeConfig({ ...DEFAULT_CODE_CONFIG });
    }
    setJsonErrors({});
  }, [tool]);

  // 当 type 变化时（仅新建模式），重置默认 config
  const handleTypeChange = (newType: ToolType) => {
    setType(newType);
    if (!isEditing) {
      if (newType === 'http') setHttpConfig({ ...DEFAULT_HTTP_CONFIG });
      else if (newType === 'mcp') setMcpConfig({ ...DEFAULT_MCP_CONFIG });
      else if (newType === 'code') setCodeConfig({ ...DEFAULT_CODE_CONFIG });
    }
  };

  const validateJson = (value: string): boolean => {
    if (!value.trim()) return true;
    try { JSON.parse(value); return true; } catch { return false; }
  };

  const handleSave = async () => {
    if (!id.trim()) { toast.error(t('tools:edit.idRequired')); return; }
    if (!name.trim()) { toast.error(t('tools:edit.nameRequired')); return; }

    // 验证 JSON schema
    const errors: Record<string, boolean> = {};
    if (!validateJson(inputSchema)) errors.inputSchema = true;
    if (!validateJson(outputSchema)) errors.outputSchema = true;
    if (Object.keys(errors).length > 0) {
      setJsonErrors(errors);
      toast.error(t('tools:edit.invalidJson'));
      return;
    }

    // 构建执行配置对象
    let execConfig: Record<string, any> = {};
    if (type === 'http') execConfig = httpConfig;
    else if (type === 'mcp') execConfig = mcpConfig;
    else if (type === 'code') execConfig = codeConfig;

    // 解析 schema
    let parsedInputSchema: Record<string, any> | undefined;
    let parsedOutputSchema: Record<string, any> | undefined;
    try { parsedInputSchema = inputSchema.trim() ? JSON.parse(inputSchema) : undefined; } catch {}
    try { parsedOutputSchema = outputSchema.trim() ? JSON.parse(outputSchema) : undefined; } catch {}

    try {
      if (isEditing) {
        await updateTool.mutateAsync({
          id: tool!.id,
          updates: {
            name: name.trim(),
            description: description.trim(),
            category,
            type,
            enabled,
            ...(isBuiltin ? {} : {
              inputSchema: parsedInputSchema,
              outputSchema: parsedOutputSchema,
              config: execConfig,
            }),
          },
        });
      } else {
        const input: CreateToolConfigInput = {
          id: id.trim(),
          name: name.trim(),
          description: description.trim(),
          category,
          type,
          enabled,
          inputSchema: parsedInputSchema,
          outputSchema: parsedOutputSchema,
          config: execConfig,
        };
        await createTool.mutateAsync(input);
      }
      toast.success(t('tools:edit.saved'));
      onClose();
    } catch (err) {
      toast.error(t('tools:edit.saveFailed', { error: err instanceof Error ? err.message : String(err) }));
    }
  };

  const isSaving = createTool.isPending || updateTool.isPending;
  const typeDisabled = isBuiltin;
  const jsonTextareaClass = (hasError: boolean) =>
    `w-full rounded border bg-surface2 px-3 py-2 font-mono text-xs text-neutral5 placeholder:text-neutral4 focus:outline-none ${hasError ? 'border-red-500 focus:border-red-500' : 'border-border1 focus:border-accent1'}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-xl border border-border1 bg-surface1 shadow-2xl" onClick={e => e.stopPropagation()}>
        {/* 头部 */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border1 bg-surface1 px-5 py-3">
          <h2 className="font-display text-base font-semibold text-neutral6">
            {isEditing ? t('tools:edit.title') : t('tools:edit.createTitle')}
          </h2>
          <button type="button" onClick={onClose} className="rounded p-1 text-neutral4 hover:bg-surface3 hover:text-neutral5">
            <X className="size-4" />
          </button>
        </div>

        {/* 表单内容 */}
        <div className="space-y-4 p-5">
          {/* 内置工具提示 */}
          {isEditing && isBuiltin && (
            <div className="flex items-start gap-2 rounded-lg border border-blue-500/30 bg-blue-500/5 p-3 text-xs text-blue-400">
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
              <span>{t('tools:edit.builtinReadOnlyFields')}</span>
            </div>
          )}

          {/* ID + Name */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral3">{t('tools:edit.id')}</label>
              <input type="text" value={id} onChange={e => setId(e.target.value)} placeholder={t('tools:edit.idPlaceholder')} disabled={isEditing} className="w-full rounded border border-border1 bg-surface2 px-3 py-2 text-sm text-neutral5 placeholder:text-neutral4 disabled:opacity-50 focus:border-accent1 focus:outline-none" />
              {!isEditing && <p className="mt-0.5 text-[10px] text-neutral4">{t('tools:edit.idHint')}</p>}
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral3">{t('tools:edit.name')}</label>
              <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder={t('tools:edit.namePlaceholder')} className="w-full rounded border border-border1 bg-surface2 px-3 py-2 text-sm text-neutral5 placeholder:text-neutral4 focus:border-accent1 focus:outline-none" />
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral3">{t('tools:edit.description')}</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} placeholder={t('tools:edit.descriptionPlaceholder')} className="w-full rounded border border-border1 bg-surface2 px-3 py-2 text-sm text-neutral5 placeholder:text-neutral4 focus:border-accent1 focus:outline-none" />
          </div>

          {/* Category + Type + Enabled */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral3">{t('tools:edit.category')}</label>
              <select value={category} onChange={e => setCategory(e.target.value as ToolCategory)} className="w-full rounded border border-border1 bg-surface2 px-2 py-2 text-sm text-neutral5 focus:border-accent1 focus:outline-none">
                {CATEGORIES.map(cat => <option key={cat} value={cat}>{t(`tools:categories.${cat}`)}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral3">{t('tools:edit.type')}</label>
              <select value={type} onChange={e => handleTypeChange(e.target.value as ToolType)} disabled={typeDisabled} className={`w-full rounded border border-border1 bg-surface2 px-2 py-2 text-sm text-neutral5 focus:border-accent1 focus:outline-none ${typeDisabled ? 'cursor-not-allowed opacity-60' : ''}`}>
                {TOOL_TYPES.map(tp => <option key={tp} value={tp}>{t(`tools:edit.type${tp.charAt(0).toUpperCase()}${tp.slice(1)}`)}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral3">{t('tools:edit.enabled')}</label>
              <div className="flex items-center gap-2 py-1.5">
                <button type="button" onClick={() => setEnabled(!enabled)} className={`relative h-6 w-11 rounded-full transition-colors ${enabled ? 'bg-accent1' : 'bg-surface4'}`}>
                  <span className={`absolute top-0.5 size-5 rounded-full bg-white transition-transform ${enabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
                </button>
                <span className="text-xs text-neutral4">{enabled ? t('tools:list.enabled') : t('tools:list.disabled')}</span>
              </div>
            </div>
          </div>

          {/* ── 根据类型显示不同的执行配置表单 ── */}
          {!isBuiltin && type === 'http' && (
            <HttpConfigForm config={httpConfig} onChange={setHttpConfig} />
          )}
          {!isBuiltin && type === 'mcp' && (
            <McpConfigForm config={mcpConfig} onChange={setMcpConfig} />
          )}
          {!isBuiltin && type === 'code' && (
            <CodeConfigForm config={codeConfig} onChange={setCodeConfig} />
          )}

          {/* Input Schema (所有非内置类型都可编辑) */}
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral3">{t('tools:edit.inputSchema')}</label>
            <textarea
              value={inputSchema}
              onChange={e => { setInputSchema(e.target.value); setJsonErrors(prev => ({ ...prev, inputSchema: false })); }}
              rows={5}
              disabled={isBuiltin}
              placeholder={t('tools:edit.inputSchemaPlaceholder')}
              className={`${jsonTextareaClass(jsonErrors.inputSchema)} ${isBuiltin ? 'cursor-not-allowed opacity-60' : ''}`}
            />
            {jsonErrors.inputSchema && <p className="mt-0.5 text-[10px] text-red-400">{t('tools:edit.invalidJson')}</p>}
            {isBuiltin && <p className="mt-0.5 text-[10px] text-neutral4">{t('tools:edit.builtinFieldsLocked')}</p>}
          </div>

          {/* Output Schema */}
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral3">{t('tools:edit.outputSchema')}</label>
            <textarea
              value={outputSchema}
              onChange={e => { setOutputSchema(e.target.value); setJsonErrors(prev => ({ ...prev, outputSchema: false })); }}
              rows={4}
              disabled={isBuiltin}
              placeholder={t('tools:edit.outputSchemaPlaceholder')}
              className={`${jsonTextareaClass(jsonErrors.outputSchema)} ${isBuiltin ? 'cursor-not-allowed opacity-60' : ''}`}
            />
            {jsonErrors.outputSchema && <p className="mt-0.5 text-[10px] text-red-400">{t('tools:edit.invalidJson')}</p>}
          </div>
        </div>

        {/* 底部操作栏 */}
        <div className="sticky bottom-0 flex items-center justify-end gap-2 border-t border-border1 bg-surface1 px-5 py-3">
          <Button variant="ghost" size="sm" onClick={onClose}>{t('tools:edit.cancel')}</Button>
          <Button size="sm" onClick={handleSave} disabled={isSaving}>
            {isSaving ? (
              <><Loader2 className="mr-1 size-4 animate-spin" />{t('tools:edit.saving')}</>
            ) : (
              <><Save className="mr-1 size-4" />{t('tools:edit.save')}</>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
