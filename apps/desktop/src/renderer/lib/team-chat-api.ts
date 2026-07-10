/**
 * Team Chat API Hooks
 *
 * 封装 Team Chat 流式 API 调用：
 * - useTeamChatStream: Supervisor 代理聊天（单流式）
 * - useTeamMultiChatStream: 多 Agent 可视化流式（SSE 事件流）
 */
import { useState, useCallback, useRef } from 'react';

// ── 复用 team-api.ts 的基础设施 ───────────────────────────────────────

function getApiBase(): string {
  const protocol = window.MASTRA_SERVER_PROTOCOL || 'http';
  const host = window.MASTRA_SERVER_HOST || 'localhost';
  const port = window.MASTRA_SERVER_PORT || '4111';
  return `${protocol}://${host}:${port}`;
}

function getHeaders(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
  };
}

// ── 类型定义 ──────────────────────────────────────────────────────────

export interface TeamChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  isStreaming?: boolean;
  agentName?: string;
}

export interface MultiAgentMessage {
  id: string;
  agentId: string;
  agentName: string;
  role: 'user' | 'assistant' | 'supervisor';
  content: string;
  isStreaming?: boolean;
}

/** SSE 事件类型（与后端 team-multi-stream.ts 对应） */
interface StreamEvent {
  type:
    | 'agent-start'
    | 'agent-delta'
    | 'agent-end'
    | 'supervisor-start'
    | 'supervisor-delta'
    | 'supervisor-end'
    | 'done'
    | 'error';
  agentId?: string;
  agentName?: string;
  content?: string;
  error?: string;
}

// ── Phase 1: Supervisor 代理聊天 Hook ─────────────────────────────────

/** 生成唯一 ID */
function genId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Team Chat 流式对话 Hook（Supervisor 代理模式） */
export function useTeamChatStream(teamId: string) {
  const [messages, setMessages] = useState<TeamChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [supervisorName, setSupervisorName] = useState('Supervisor');
  const [threadId] = useState(() => `team-${teamId}-chat-${genId()}`);
  const abortRef = useRef<AbortController | null>(null);

  const send = useCallback(
    async (message: string) => {
      if (!message.trim() || isStreaming) return;

      const userMsg: TeamChatMessage = {
        id: genId(),
        role: 'user',
        content: message,
      };
      const assistantId = genId();
      const assistantMsg: TeamChatMessage = {
        id: assistantId,
        role: 'assistant',
        content: '',
        isStreaming: true,
      };

      setMessages(prev => [...prev, userMsg, assistantMsg]);
      setIsStreaming(true);

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const base = getApiBase();
        const response = await fetch(`${base}/research/teams/${teamId}/chat/stream`, {
          method: 'POST',
          headers: getHeaders(),
          body: JSON.stringify({ message, threadId }),
          signal: controller.signal,
        });

        if (!response.ok) {
          const body = await response.json().catch(() => ({ error: response.statusText }));
          throw new Error(body.error || `HTTP ${response.status}`);
        }

        // 读取 Supervisor 显示名称
        const agentNameHeader = response.headers.get('X-Agent-Name');
        if (agentNameHeader) {
          setSupervisorName(decodeURIComponent(agentNameHeader));
        }

        const reader = response.body?.getReader();
        const decoder = new TextDecoder();

        if (reader) {
          let accumulated = '';
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            accumulated += decoder.decode(value, { stream: true });
            setMessages(prev =>
              prev.map(m => (m.id === assistantId ? { ...m, content: accumulated } : m)),
            );
          }
        }

        setMessages(prev =>
          prev.map(m => (m.id === assistantId ? { ...m, isStreaming: false } : m)),
        );
      } catch (err) {
        if (err instanceof Error && err.name !== 'AbortError') {
          setMessages(prev =>
            prev.map(m =>
              m.id === assistantId
                ? { ...m, content: `⚠️ 请求失败: ${err.message}`, isStreaming: false }
                : m,
            ),
          );
        }
      } finally {
        setIsStreaming(false);
        abortRef.current = null;
      }
    },
    [teamId, threadId, isStreaming],
  );

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    setIsStreaming(false);
  }, []);

  const clear = useCallback(() => {
    setMessages([]);
  }, []);

  return { messages, isStreaming, supervisorName, threadId, send, cancel, clear };
}

// ── Phase 2: 多 Agent 可视化流式 Hook ─────────────────────────────────

/** Team 多 Agent Chat 流式对话 Hook */
export function useTeamMultiChatStream(teamId: string) {
  const [messages, setMessages] = useState<MultiAgentMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const send = useCallback(
    async (message: string) => {
      if (!message.trim() || isStreaming) return;

      // 添加用户消息
      setMessages(prev => [
        ...prev,
        {
          id: genId(),
          agentId: 'user',
          agentName: 'You',
          role: 'user',
          content: message,
        },
      ]);

      setIsStreaming(true);
      const controller = new AbortController();
      abortRef.current = controller;

      // 用于跟踪各 agent 的消息
      const agentMessages = new Map<string, MultiAgentMessage>();

      try {
        const base = getApiBase();
        const response = await fetch(`${base}/research/teams/${teamId}/multi-chat/stream`, {
          method: 'POST',
          headers: getHeaders(),
          body: JSON.stringify({ message }),
          signal: controller.signal,
        });

        if (!response.ok) {
          const body = await response.json().catch(() => ({ error: response.statusText }));
          throw new Error(body.error || `HTTP ${response.status}`);
        }

        const reader = response.body?.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        if (reader) {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n\n');
            buffer = lines.pop() ?? '';

            for (const line of lines) {
              if (!line.startsWith('data: ')) continue;
              const dataStr = line.slice(6);
              let data: StreamEvent;
              try {
                data = JSON.parse(dataStr);
              } catch {
                continue;
              }

              switch (data.type) {
                case 'agent-start':
                case 'supervisor-start': {
                  const id = genId();
                  const msg: MultiAgentMessage = {
                    id,
                    agentId: data.agentId!,
                    agentName: data.agentName!,
                    role: data.type === 'supervisor-start' ? 'supervisor' : 'assistant',
                    content: '',
                    isStreaming: true,
                  };
                  agentMessages.set(data.agentId!, msg);
                  setMessages(prev => [...prev, msg]);
                  break;
                }
                case 'agent-delta':
                case 'supervisor-delta': {
                  const msg = agentMessages.get(data.agentId!);
                  if (msg) {
                    msg.content += data.content ?? '';
                    const content = msg.content;
                    setMessages(prev =>
                      prev.map(m => (m.id === msg.id ? { ...m, content } : m)),
                    );
                  }
                  break;
                }
                case 'agent-end':
                case 'supervisor-end': {
                  const msg = agentMessages.get(data.agentId!);
                  if (msg) {
                    msg.isStreaming = false;
                    setMessages(prev =>
                      prev.map(m => (m.id === msg.id ? { ...m, isStreaming: false } : m)),
                    );
                  }
                  break;
                }
                case 'done':
                  break;
                case 'error':
                  console.error('[Team Multi Chat] Stream error:', data.error);
                  break;
              }
            }
          }
        }
      } catch (err) {
        if (err instanceof Error && err.name !== 'AbortError') {
          setMessages(prev => [
            ...prev,
            {
              id: genId(),
              agentId: 'error',
              agentName: 'Error',
              role: 'supervisor',
              content: `⚠️ ${err.message}`,
            },
          ]);
        }
      } finally {
        setIsStreaming(false);
        abortRef.current = null;
      }
    },
    [teamId, isStreaming],
  );

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    setIsStreaming(false);
  }, []);

  const clear = useCallback(() => setMessages([]), []);

  return { messages, isStreaming, send, cancel, clear };
}
