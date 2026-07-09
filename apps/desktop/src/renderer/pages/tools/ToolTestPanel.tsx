import { Button } from '@mastra/playground-ui/components/Button';
import { Loader2, X, Play, CheckCircle, AlertCircle } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ToolConfig } from '@trading-agent/shared';
import { useTestTool } from '@/lib/tool-api';

interface ToolTestPanelProps {
  tool: ToolConfig;
  onClose: () => void;
}

export function ToolTestPanel({ tool, onClose }: ToolTestPanelProps) {
  const { t } = useTranslation(['tools', 'common']);
  const testTool = useTestTool();
  const [inputText, setInputText] = useState('{\n  \n}');

  const handleRun = async () => {
    let parsedInput: Record<string, any>;
    try {
      parsedInput = JSON.parse(inputText);
    } catch {
      return;
    }
    testTool.mutate({ id: tool.id, input: parsedInput });
  };

  const result = testTool.data?.result;
  const error = testTool.error;

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
          <div>
            <h2 className="font-display text-base font-semibold text-neutral6">
              {t('tools:test.title')}
            </h2>
            <p className="text-xs text-neutral3">{tool.name} ({tool.type})</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-neutral4 hover:bg-surface3 hover:text-neutral5"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* 内容 */}
        <div className="space-y-4 p-5">
          {/* 输入区 */}
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral3">
              {t('tools:test.inputPlaceholder')}
            </label>
            <textarea
              value={inputText}
              onChange={e => setInputText(e.target.value)}
              rows={6}
              placeholder='{ "symbol": "AAPL" }'
              className="w-full rounded border border-border1 bg-surface2 px-3 py-2 font-mono text-xs text-neutral5 placeholder:text-neutral4 focus:border-accent1 focus:outline-none"
            />
          </div>

          {/* 执行按钮 */}
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={handleRun}
              disabled={testTool.isPending}
            >
              {testTool.isPending ? (
                <>
                  <Loader2 className="mr-1 size-4 animate-spin" />
                  {t('tools:test.running')}
                </>
              ) : (
                <>
                  <Play className="mr-1 size-4" />
                  {t('tools:test.run')}
                </>
              )}
            </Button>
          </div>

          {/* 结果区 */}
          {error && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-3">
              <div className="flex items-center gap-2 text-sm font-medium text-red-400">
                <AlertCircle className="size-4 shrink-0" />
                {t('tools:test.error')}
              </div>
              <pre className="mt-2 overflow-x-auto whitespace-pre-wrap text-xs text-red-300">
                {error instanceof Error ? error.message : String(error)}
              </pre>
            </div>
          )}

          {result !== undefined && !error && (
            <div className="rounded-lg border border-green-500/30 bg-green-500/5 p-3">
              <div className="flex items-center gap-2 text-sm font-medium text-green-400">
                <CheckCircle className="size-4 shrink-0" />
                {t('tools:test.success')}
              </div>
              <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap text-xs text-neutral4">
                {JSON.stringify(result, null, 2)}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
