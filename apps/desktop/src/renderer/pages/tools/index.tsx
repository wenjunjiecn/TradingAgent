import { Button } from '@mastra/playground-ui/components/Button';
import { PageLayout } from '@mastra/playground-ui/components/PageLayout';
import {
  Plus,
  Search,
  Pencil,
  Trash2,
  Wrench,
  Loader2,
  Power,
  AlertCircle,
} from 'lucide-react';
import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { ToolConfig, ToolCategory } from '@trading-agent/shared';
import { useToolConfigs, useDeleteTool, useUpdateTool } from '@/lib/tool-api';
import { ToolEditDialog } from './ToolEditDialog';

// ── 分类图标映射 ──────────────────────────────────────────────────────
const CATEGORY_COLORS: Record<ToolCategory, string> = {
  'market-data': 'text-blue-400 bg-blue-500/10 border-blue-500/20',
  'technical-analysis': 'text-purple-400 bg-purple-500/10 border-purple-500/20',
  'news-sentiment': 'text-orange-400 bg-orange-500/10 border-orange-500/20',
  'fundamentals': 'text-green-400 bg-green-500/10 border-green-500/20',
  'custom': 'text-neutral4 bg-surface4 border-border1',
};

export default function Tools() {
  const { t } = useTranslation(['tools', 'common']);
  const { data: toolsData, isLoading, error } = useToolConfigs();
  const deleteTool = useDeleteTool();
  const updateTool = useUpdateTool();

  const [search, setSearch] = useState('');
  const [editTool, setEditTool] = useState<ToolConfig | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const tools = toolsData?.tools ?? [];

  const filteredTools = useMemo(() => {
    if (!search.trim()) return tools;
    const q = search.toLowerCase();
    return tools.filter(
      tool =>
        tool.name.toLowerCase().includes(q) ||
        tool.description.toLowerCase().includes(q) ||
        tool.id.toLowerCase().includes(q),
    );
  }, [tools, search]);

  const handleDelete = async (tool: ToolConfig) => {
    if (tool.isBuiltin) return;
    if (confirm(t('tools:list.deleteConfirm', { name: tool.name }))) {
      try {
        await deleteTool.mutateAsync(tool.id);
      } catch (err) {
        alert(err instanceof Error ? err.message : String(err));
      }
    }
  };

  const handleToggleEnabled = async (tool: ToolConfig) => {
    try {
      await updateTool.mutateAsync({
        id: tool.id,
        updates: { enabled: !tool.enabled },
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
          {t('tools:list.loading')}
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
            {t('tools:list.title')}
          </h1>
          <p className="text-sm text-neutral3">{t('tools:list.subtitle')}</p>
        </div>
        <Button size="sm" onClick={() => setShowCreate(true)}>
          <Plus className="mr-1 size-4" />
          {t('tools:list.create')}
        </Button>
      </div>

      {/* 搜索栏 */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-neutral4" />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder={t('tools:list.searchPlaceholder')}
          className="w-full rounded-lg border border-border1 bg-surface2 py-2 pl-9 pr-3 text-sm text-neutral5 placeholder:text-neutral4 focus:border-accent1 focus:outline-none"
        />
      </div>

      {/* 工具卡片网格 */}
      {filteredTools.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 py-16">
          <Wrench className="size-12 text-neutral4" />
          <p className="text-sm text-neutral3">
            {search ? t('tools:list.noMatch') : t('tools:list.empty')}
          </p>
          {!search && (
            <Button size="sm" onClick={() => setShowCreate(true)}>
              <Plus className="mr-1 size-4" />
              {t('tools:list.create')}
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-3">
          {filteredTools.map(tool => {
            const categoryColor = CATEGORY_COLORS[tool.category] ?? CATEGORY_COLORS.custom;
            return (
              <div
                key={tool.id}
                className={`flex flex-col gap-3 rounded-xl border bg-surface3 p-4 transition-colors hover:border-border2 ${
                  tool.enabled ? 'border-border1' : 'border-border1 opacity-60'
                }`}
              >
                {/* 头部 */}
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="truncate font-display text-sm font-semibold text-neutral6">
                        {tool.name}
                      </h3>
                      {tool.isBuiltin ? (
                        <span className="shrink-0 rounded border border-border1 bg-surface4 px-1.5 py-0.5 text-[10px] font-medium text-neutral3">
                          {t('tools:list.builtin')}
                        </span>
                      ) : (
                        <span className="shrink-0 rounded border border-accent1/30 bg-accent1/10 px-1.5 py-0.5 text-[10px] font-medium text-accent1">
                          {t('tools:list.custom')}
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 line-clamp-2 text-xs text-neutral3">
                      {tool.description || '—'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleToggleEnabled(tool)}
                    title={t('tools:list.toggleEnabled')}
                    className={`flex shrink-0 items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-medium transition-colors ${
                      tool.enabled
                        ? 'border-green-500/20 bg-green-500/10 text-green-400 hover:bg-green-500/20'
                        : 'border-border1 bg-surface4 text-neutral4 hover:bg-surface2'
                    }`}
                  >
                    <Power className="size-3" />
                    {tool.enabled ? t('tools:list.enabled') : t('tools:list.disabled')}
                  </button>
                </div>

                {/* 分类标签 */}
                <div className="flex items-center gap-2">
                  <span
                    className={`rounded border px-1.5 py-0.5 text-[10px] font-medium ${categoryColor}`}
                  >
                    {t(`tools:categories.${tool.category}`)}
                  </span>
                  <span className="text-[10px] text-neutral4 font-mono">{tool.id}</span>
                </div>

                {/* 操作按钮 */}
                <div className="mt-auto flex items-center gap-2 pt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setEditTool(tool)}
                  >
                    <Pencil className="mr-1 size-3.5" />
                    {t('tools:list.editButton')}
                  </Button>
                  {!tool.isBuiltin && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDelete(tool)}
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
        <ToolEditDialog
          tool={null}
          onClose={() => setShowCreate(false)}
        />
      )}
      {editTool && (
        <ToolEditDialog
          tool={editTool}
          onClose={() => setEditTool(null)}
        />
      )}
    </PageLayout>
  );
}
