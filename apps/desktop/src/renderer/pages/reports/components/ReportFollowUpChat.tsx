import { useState, useRef, useCallback, useEffect } from 'react';
import { ArrowUp, MessageCircle, X } from 'lucide-react';
import { Button } from '@mastra/playground-ui/components/Button';
import { ScrollArea } from '@mastra/playground-ui/components/ScrollArea';
import { PendingIndicator } from '@mastra/playground-ui/components/PendingIndicator';
import { MarkdownRenderer } from '@mastra/playground-ui/components/MarkdownRenderer';
import { useAutoscroll } from '@mastra/playground-ui/hooks/use-autoscroll';

/**
 * 报告追问 Chat 组件
 *
 * 以右下角悬浮框形式呈现，允许用户基于报告内容流式追问 Supervisor。
 * 折叠时显示圆形气泡按钮，展开后显示完整聊天面板。
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
  const [isOpen, setIsOpen] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const areaRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  useAutoscroll(areaRef, { enabled: true });

  // 展开时自动聚焦输入框
  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => textareaRef.current?.focus(), 200);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

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
    <>
      {/* ── 折叠态：右下角悬浮按钮 ── */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-6 right-6 z-50 flex size-14 items-center justify-center rounded-full bg-accent1 text-white shadow-lg shadow-accent1/30 transition-all duration-200 hover:scale-105 hover:shadow-xl hover:shadow-accent1/40 active:scale-95"
          aria-label="追问与讨论"
        >
          <MessageCircle className="size-6" />
          {messages.length > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex size-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
              {messages.length}
            </span>
          )}
        </button>
      )}

      {/* ── 展开态：悬浮聊天面板 ── */}
      {isOpen && (
        <div className="fixed bottom-6 right-6 z-50 flex h-[520px] w-[400px] max-w-[calc(100vw-3rem)] flex-col overflow-hidden rounded-2xl border border-border1 bg-surface1 shadow-2xl shadow-black/20">
          {/* 面板头部 */}
          <div className="flex items-center justify-between border-b border-border1 bg-surface2 px-4 py-3">
            <div className="flex items-center gap-2">
              <MessageCircle className="size-4 text-accent1" />
              <h3 className="font-display text-sm font-semibold text-neutral6">追问与讨论</h3>
              <span className="text-xs text-neutral3">基于此报告与 Supervisor 对话</span>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="rounded-md p-1 text-neutral3 transition-colors hover:bg-surface3 hover:text-neutral6"
              aria-label="关闭"
            >
              <X className="size-4" />
            </button>
          </div>

          {/* 消息列表 */}
          <div ref={areaRef} className="flex-1 overflow-y-scroll" style={{ overflowAnchor: 'none' }}>
            {isEmpty ? (
              <div className="flex h-full flex-col items-center justify-center px-6 text-center">
                <MessageCircle className="mb-3 size-10 text-neutral4" />
                <p className="text-sm text-neutral3">
                  向 Supervisor 追问关于此报告的任何问题
                </p>
                <p className="mt-1 text-xs text-neutral4">
                  如「风险部分能详细说说吗？」
                </p>
              </div>
            ) : (
              <div className="relative w-full px-4 pb-3">
                <div className="flex flex-col gap-4 py-4">
                  {messages.map((msg, i) => {
                    if (msg.role === 'user') {
                      return (
                        <div key={i} className="flex w-full flex-col items-end pt-1 pb-2">
                          <div className="max-w-[85%] break-words rounded-xl bg-surface3 px-3.5 py-2 text-ui-lg leading-ui-lg text-neutral6">
                            {msg.content}
                          </div>
                        </div>
                      );
                    }
                    return (
                      <div key={i} className="max-w-full">
                        <div className="pt-1 text-ui-lg leading-ui-lg text-neutral6">
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

          {/* 输入区 */}
          <div className="border-t border-border1 bg-surface2 p-2.5">
            <form
              onSubmit={e => {
                e.preventDefault();
                handleSend();
              }}
            >
              <div
                className="relative overflow-hidden rounded-[18px] border border-border2/40 bg-surface3 transition-colors duration-normal focus-within:border-border2"
                onClick={e => {
                  if (e.target === e.currentTarget) textareaRef.current?.focus();
                }}
              >
                <div className="relative z-10">
                  <ScrollArea maxHeight="100px">
                    <textarea
                      ref={textareaRef}
                      value={input}
                      autoFocus={false}
                      className="field-sizing-content min-h-11 w-full resize-none bg-transparent px-3 pt-2.5 pb-1.5 text-ui-lg leading-ui-lg text-neutral6 placeholder:text-neutral3 focus:outline-hidden disabled:cursor-not-allowed disabled:opacity-50"
                      placeholder="基于此报告追问..."
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
                  {/* 操作行 */}
                  <div className="flex flex-wrap-reverse items-center justify-end gap-2 px-1.5 pb-1.5">
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
                        <ArrowUp className="h-5 w-5 text-neutral3 hover:text-neutral6" />
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
