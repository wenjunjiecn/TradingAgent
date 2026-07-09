import { useState, useRef, useCallback, useEffect } from 'react';
import { ArrowUp, MessageCircle } from 'lucide-react';
import { Button } from '@mastra/playground-ui/components/Button';
import { ScrollArea } from '@mastra/playground-ui/components/ScrollArea';
import { PendingIndicator } from '@mastra/playground-ui/components/PendingIndicator';
import { MarkdownRenderer } from '@mastra/playground-ui/components/MarkdownRenderer';
import { useAutoscroll } from '@mastra/playground-ui/hooks/use-autoscroll';
import { cn } from '@mastra/playground-ui/utils/cn';

/**
 * 报告追问 Chat 组件
 *
 * 嵌入报告详情页底部，允许用户基于报告内容流式追问 Supervisor。
 * 样式匹配 Agent Chat 的 Thread / MessageRow / Composer。
 */

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  isStreaming?: boolean;
}

function getApiBase(): string {
  const protocol = window.MASTRA_SERVER_PROTOCOL || 'http';
  const host = window.MASTRA_SERVER_HOST || 'localhost';
  const port = window.MASTRA_SERVER_PORT || '4111';
  return `${protocol}://${host}:${port}`;
}

function getHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  const token = window.tradingAgent?.desktopAuthToken;
  if (token) {
    headers['x-trading-agent-token'] = token;
  }
  return headers;
}

const CircleStopIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="text-neutral3 hover:text-neutral6"
  >
    <circle cx="12" cy="12" r="10" />
    <rect width="6" height="6" x="9" y="9" rx="1" />
  </svg>
);

export function ReportFollowUpChat({ reportId }: { reportId: string }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const areaRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  useAutoscroll(areaRef, { enabled: true });

  const handleSend = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed || isStreaming) return;

    const userMsg: ChatMessage = { role: 'user', content: trimmed };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsStreaming(true);

    setMessages(prev => [...prev, { role: 'assistant', content: '', isStreaming: true }]);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const base = getApiBase();
      const response = await fetch(`${base}/research/reports/${reportId}/follow-up/stream`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          message: trimmed,
          history: messages.map(m => ({ role: m.role, content: m.content })),
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({ error: response.statusText }));
        throw new Error(body.error || `HTTP ${response.status}`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (reader) {
        let accumulated = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          accumulated += decoder.decode(value, { stream: true });
          setMessages(prev => {
            const updated = [...prev];
            updated[updated.length - 1] = { role: 'assistant', content: accumulated, isStreaming: true };
            return updated;
          });
        }
        setMessages(prev => {
          const updated = [...prev];
          updated[updated.length - 1] = { role: 'assistant', content: updated[updated.length - 1].content, isStreaming: false };
          return updated;
        });
      }
    } catch (err) {
      if (err instanceof Error && err.name !== 'AbortError') {
        setMessages(prev => {
          const updated = [...prev];
          updated[updated.length - 1] = {
            role: 'assistant',
            content: `⚠️ 请求失败: ${err.message}`,
            isStreaming: false,
          };
          return updated;
        });
      }
    } finally {
      setIsStreaming(false);
      abortRef.current = null;
    }
  }, [input, isStreaming, messages, reportId]);

  const handleStop = useCallback(() => {
    abortRef.current?.abort();
    setIsStreaming(false);
  }, []);

  const isEmpty = messages.length === 0;

  return (
    <div className="flex flex-col border-t border-border1 pt-4">
      {/* 标题 */}
      <div className="flex items-center gap-2 px-4">
        <MessageCircle className="size-4 text-accent1" />
        <h3 className="font-display text-sm font-semibold text-neutral6">追问与讨论</h3>
        <span className="text-xs text-neutral3">基于此报告内容与 Supervisor 对话</span>
      </div>

      {/* 消息列表 — 匹配 Thread 布局 */}
      <div className="grid grid-rows-[1fr_auto] max-h-[60vh] overflow-hidden">
        <div ref={areaRef} className="overflow-y-scroll" style={{ overflowAnchor: 'none' }}>
          {isEmpty ? (
            <div className="flex w-full flex-col items-center pt-8 pb-4">
              <p className="text-sm text-neutral3">向 Supervisor 追问关于此报告的任何问题</p>
            </div>
          ) : (
            <div className="relative max-w-3xl w-full mx-auto px-4 pb-3">
              <div className="flex flex-col gap-6 py-4">
                {messages.map((msg, i) => {
                  if (msg.role === 'user') {
                    return (
                      <div key={i} className="w-full flex items-end pb-4 pt-2 flex-col">
                        <div className="max-w-[max(366px,70%)] break-words px-4 py-2 text-neutral6 text-ui-lg leading-ui-lg rounded-xl bg-surface3">
                          {msg.content}
                        </div>
                      </div>
                    );
                  }
                  return (
                    <div key={i} className="max-w-full">
                      <div className="text-neutral6 text-ui-lg leading-ui-lg pt-2">
                        {msg.content ? (
                          <MarkdownRenderer>{msg.content}</MarkdownRenderer>
                        ) : (
                          <span className="text-neutral3">...</span>
                        )}
                      </div>
                    </div>
                  );
                })}
                {isStreaming && <PendingIndicator />}
              </div>
            </div>
          )}
        </div>

        {/* Composer — 匹配 Agent Chat 样式 */}
        <div className="relative px-2 pb-2">
          <form
            onSubmit={e => {
              e.preventDefault();
              handleSend();
            }}
          >
            <div
              className="relative overflow-hidden bg-surface3 rounded-[22px] border border-border2/40 max-w-3xl w-full mx-auto transition-colors duration-normal focus-within:border-border2"
              onClick={e => {
                if (e.target === e.currentTarget) textareaRef.current?.focus();
              }}
            >
              <div className="relative z-10">
                <ScrollArea maxHeight="120px">
                  <textarea
                    ref={textareaRef}
                    value={input}
                    autoFocus={false}
                    className="field-sizing-content min-h-14 w-full text-ui-lg leading-ui-lg placeholder:text-neutral3 text-neutral6 bg-transparent focus:outline-hidden resize-none outline-hidden disabled:cursor-not-allowed disabled:opacity-50 px-3 pt-3 pb-2"
                    placeholder="基于此报告追问，如「风险部分能详细说说吗？」"
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={e => {
                      if (e.nativeEvent.isComposing || e.keyCode === 229) return;
                      if (e.key === 'Enter' && !e.shiftKey) {
                        if (isStreaming) return;
                        e.preventDefault();
                        e.stopPropagation();
                        handleSend();
                      }
                    }}
                    disabled={isStreaming}
                  />
                </ScrollArea>
                {/* Action Row */}
                <div className="flex flex-wrap-reverse justify-end items-center gap-2 px-1.5 pb-1.5">
                  {isStreaming ? (
                    <Button
                      variant="default"
                      size="icon-md"
                      type="button"
                      tooltip="停止"
                      onClick={handleStop}
                    >
                      <CircleStopIcon />
                    </Button>
                  ) : (
                    <Button
                      type="submit"
                      variant="default"
                      size="icon-md"
                      tooltip="发送"
                      className="rounded-full border border-border1 bg-surface5"
                      disabled={!input.trim()}
                    >
                      <ArrowUp className="h-6 w-6 text-neutral3 hover:text-neutral6" />
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
