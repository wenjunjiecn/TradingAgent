import { MarkdownRenderer } from '@mastra/playground-ui/components/MarkdownRenderer';
import { cn } from '@mastra/playground-ui/utils/cn';
import { Loader2 } from 'lucide-react';
import type { MultiAgentMessage } from '@/lib/team-chat-api';

/**
 * 多 Agent 消息气泡组件
 *
 * 匹配 Agent Chat 的 MessageRow 样式：
 * - User: 右对齐气泡 (bg-surface3 rounded-xl)
 * - Assistant: 全宽无气泡文本
 * - Supervisor: 全宽文本 + 顶部分隔线 + 角色标签
 */

const AVATAR_COLORS = [
  'text-blue-400',
  'text-green-400',
  'text-purple-400',
  'text-orange-400',
  'text-pink-400',
  'text-cyan-400',
  'text-amber-400',
  'text-indigo-400',
];

function getColorIndex(agentId: string): number {
  let hash = 0;
  for (let i = 0; i < agentId.length; i++) {
    hash = ((hash << 5) - hash + agentId.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % AVATAR_COLORS.length;
}

export function AgentMessageBubble({ message }: { message: MultiAgentMessage }) {
  const isSupervisor = message.role === 'supervisor';
  const isUser = message.role === 'user';
  const isError = message.agentId === 'error';

  // User 消息 — 匹配 MessageRow user 样式
  if (isUser) {
    return (
      <div className="w-full flex items-end pb-4 pt-2 flex-col">
        <div className="max-w-[max(366px,70%)] break-words px-4 py-2 text-neutral6 text-ui-lg leading-ui-lg rounded-xl bg-surface3">
          {message.content}
        </div>
      </div>
    );
  }

  const colorClass = isError
    ? 'text-red-400'
    : isSupervisor
      ? 'text-accent1'
      : AVATAR_COLORS[getColorIndex(message.agentId)];

  // Assistant / Supervisor — 匹配 MessageRow assistant 样式
  return (
    <div className={cn('max-w-full', isSupervisor && 'border-t border-border1 pt-4')}>
      {/* Agent 名称标签 */}
      <div className="mb-1 flex items-center gap-2">
        <span className={cn('text-xs font-medium', colorClass)}>{message.agentName}</span>
        {isSupervisor && (
          <span className="rounded bg-accent1/10 px-1 py-0.5 text-[10px] text-accent1">
            Supervisor
          </span>
        )}
        {message.isStreaming && (
          <Loader2 className="size-3 animate-spin text-neutral3" />
        )}
      </div>

      {/* 消息内容 — 全宽无气泡 */}
      <div className="text-neutral6 text-ui-lg leading-ui-lg pt-1">
        {message.content ? (
          <MarkdownRenderer>{message.content}</MarkdownRenderer>
        ) : (
          <span className="text-neutral3">...</span>
        )}
      </div>
    </div>
  );
}
