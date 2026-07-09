import { Button } from '@mastra/playground-ui/components/Button';
import { ErrorState } from '@mastra/playground-ui/components/ErrorState';
import { PageLayout } from '@mastra/playground-ui/components/PageLayout';
import { ScrollArea } from '@mastra/playground-ui/components/ScrollArea';
import { PendingIndicator } from '@mastra/playground-ui/components/PendingIndicator';
import { MarkdownRenderer } from '@mastra/playground-ui/components/MarkdownRenderer';
import { useAutoscroll } from '@mastra/playground-ui/hooks/use-autoscroll';
import { cn } from '@mastra/playground-ui/utils/cn';
import { ArrowUp, ArrowLeft, Users, Trash2, Loader2 } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useTeamConfig } from '@/lib/team-api';
import { useAgentConfigs } from '@/lib/research-api';
import {
  useTeamChatStream,
  useTeamMultiChatStream,
  type TeamChatMessage,
  type MultiAgentMessage,
} from '@/lib/team-chat-api';
import type { CollaborationPattern } from '@trading-agent/shared';
import { AgentMessageBubble } from './components/AgentMessageBubble';

type ChatMode = 'supervisor' | 'multi';

const PATTERN_LABELS: Record<CollaborationPattern, string> = {
  council: '圆桌会议',
  pipeline: '流水线',
  debate: '辩论',
  hierarchical: '层级委派',
  'parallel-scan': '并行扫描',
};

export default function TeamChatPage() {
  const { teamId } = useParams<{ teamId: string }>();
  const navigate = useNavigate();
  const { data: teamData, isLoading } = useTeamConfig(teamId ?? null);
  const { data: agentsData } = useAgentConfigs();
  const team = teamData?.team;

  // 构建 agentId → name 映射
  const agentNameMap = new Map<string, string>();
  if (agentsData?.agents) {
    for (const a of agentsData.agents) {
      agentNameMap.set(a.id, a.name);
    }
  }

  /** 根据 member 解析显示名称 */
  const getMemberName = (agentId: string, alias?: string) =>
    alias ?? agentNameMap.get(agentId) ?? agentId;

  const defaultMode: ChatMode =
    team?.collaboration.pattern === 'hierarchical' ? 'supervisor' : 'multi';
  const [chatMode, setChatMode] = useState<ChatMode>(defaultMode);

  const supervisorChat = useTeamChatStream(teamId ?? '');
  const multiChat = useTeamMultiChatStream(teamId ?? '');

  const activeChat = chatMode === 'supervisor' ? supervisorChat : multiChat;
  const { messages, isStreaming, send, cancel, clear } = activeChat;
  const supervisorName = chatMode === 'supervisor' ? supervisorChat.supervisorName : undefined;

  const [input, setInput] = useState('');
  const areaRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  useAutoscroll(areaRef, { enabled: true });

  useEffect(() => {
    if (team) {
      const mode: ChatMode =
        team.collaboration.pattern === 'hierarchical' ? 'supervisor' : 'multi';
      setChatMode(mode);
    }
  }, [team?.collaboration.pattern]);

  const isEmpty = messages.length === 0;

  const submit = () => {
    const trimmed = input.trim();
    if (!trimmed || isStreaming) return;
    setInput('');
    send(trimmed);
  };

  if (isLoading) {
    return (
      <PageLayout className="flex items-center justify-center p-8">
        <Loader2 className="size-6 animate-spin text-neutral3" />
      </PageLayout>
    );
  }

  if (!team) {
    return (
      <PageLayout className="p-4">
        <ErrorState title="Team not found" message={`Team "${teamId}" does not exist.`} />
      </PageLayout>
    );
  }

  return (
    <PageLayout className="flex h-full flex-col p-0">
      {/* 顶部栏 */}
      <div className="flex items-center justify-between border-b border-border1 px-4 py-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate(`/teams/${teamId}/execute`)}>
            <ArrowLeft className="mr-1 size-4" />
            返回
          </Button>
          <div className="flex items-center gap-2">
            <Users className="size-4 text-accent1" />
            <h1 className="font-display text-lg font-bold text-neutral6">{team.name}</h1>
            <span className="rounded bg-accent1/10 px-1.5 py-0.5 text-xs text-accent1">Chat</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* 模式切换 */}
          <div className="flex items-center gap-1 rounded-lg border border-border1 bg-surface2 p-0.5">
            <button
              onClick={() => setChatMode('supervisor')}
              className={cn(
                'rounded px-2 py-1 text-xs transition-colors',
                chatMode === 'supervisor'
                  ? 'bg-accent1 text-white'
                  : 'text-neutral3 hover:text-neutral4',
              )}
            >
              Supervisor
            </button>
            <button
              onClick={() => setChatMode('multi')}
              className={cn(
                'rounded px-2 py-1 text-xs transition-colors',
                chatMode === 'multi'
                  ? 'bg-accent1 text-white'
                  : 'text-neutral3 hover:text-neutral4',
              )}
            >
              多 Agent
            </button>
          </div>
          <Button variant="ghost" size="sm" onClick={clear} className="text-neutral3">
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      </div>

      {/* 协作模式提示 */}
      <div className="border-b border-border1 bg-surface3 px-4 py-1.5">
        <span className="text-xs text-neutral3">
          {PATTERN_LABELS[team.collaboration.pattern]} ·{' '}
          {chatMode === 'supervisor'
            ? 'Supervisor 代理模式，自动委派子 Agent'
            : team.collaboration.pattern === 'pipeline'
              ? '串行流式，Agent 按顺序依次分析'
              : '并行流式，各 Agent 同时分析'}
        </span>
      </div>

      {/* 消息列表 — 匹配 Thread 布局 */}
      <div className="group/thread grid grid-rows-[1fr_auto] h-full overflow-y-auto">
        <div ref={areaRef} className="overflow-y-scroll h-full" style={{ overflowAnchor: 'none' }}>
          {isEmpty ? (
            <TeamChatWelcome teamName={team.name} defaultTarget={team.defaultTarget} onStarterPrompt={setInput} />
          ) : (
            <div className="relative max-w-3xl w-full mx-auto px-4 pb-7">
              <div className="flex flex-col gap-6 py-6">
                {chatMode === 'supervisor'
                  ? (messages as TeamChatMessage[]).map(msg => (
                      <TeamMessageRow key={msg.id} message={msg} agentName={supervisorName} />
                    ))
                  : (messages as MultiAgentMessage[]).map(msg => (
                      <AgentMessageBubble key={msg.id} message={msg} />
                    ))}
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
              submit();
            }}
          >
            <div
              className="relative overflow-hidden bg-surface3 rounded-[22px] border border-border2/40 mt-auto max-w-3xl w-full mx-auto transition-colors duration-normal focus-within:border-border2"
              onClick={e => {
                if (e.target === e.currentTarget) textareaRef.current?.focus();
              }}
            >
              <div className="relative z-10">
                <ScrollArea maxHeight="212px">
                  <textarea
                    ref={textareaRef}
                    value={input}
                    autoFocus={false}
                    className="field-sizing-content min-h-17 w-full text-ui-lg leading-ui-lg placeholder:text-neutral3 text-neutral6 bg-transparent focus:outline-hidden resize-none outline-hidden disabled:cursor-not-allowed disabled:opacity-50 px-3 pt-3 pb-2"
                    placeholder="输入消息，如「分析 AAPL 的投资价值」..."
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={e => {
                      if (e.nativeEvent.isComposing || e.keyCode === 229) return;
                      if (e.key === 'Enter' && !e.shiftKey) {
                        if (isStreaming) return;
                        e.preventDefault();
                        e.stopPropagation();
                        submit();
                      }
                    }}
                  />
                </ScrollArea>
                {/* Action Row */}
                <div className="flex flex-wrap-reverse justify-between items-center gap-2 px-1.5 pb-1.5">
                  <div className="flex shrink-0 items-center gap-1.5">
                    {/* 成员标签 */}
                    <div className="flex flex-wrap gap-1">
                      {team.members.slice(0, 4).map(m => (
                        <span
                          key={m.agentId}
                          className="rounded-full border border-border1 bg-surface2 px-2 py-0.5 text-xs text-neutral4"
                        >
                          {getMemberName(m.agentId, m.alias)}
                        </span>
                      ))}
                      {team.members.length > 4 && (
                        <span className="text-xs text-neutral3">+{team.members.length - 4}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {isStreaming ? (
                      <Button
                        variant="default"
                        size="icon-md"
                        type="button"
                        tooltip="停止"
                        onClick={cancel}
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
            </div>
          </form>
        </div>
      </div>
    </PageLayout>
  );
}

// ── 消息行 — 匹配 MessageRow 样式 ──────────────────────────────────────

function TeamMessageRow({ message, agentName }: { message: TeamChatMessage; agentName?: string }) {
  if (message.role === 'user') {
    return (
      <div className="w-full flex items-end pb-4 pt-2 flex-col">
        <div
          className={cn(
            'max-w-[max(366px,70%)] break-words px-4 py-2 text-neutral6 text-ui-lg leading-ui-lg rounded-xl bg-surface3',
            message.isStreaming && 'opacity-60 animate-pulse',
          )}
        >
          {message.content}
        </div>
      </div>
    );
  }

  // assistant — 全宽无气泡，匹配现有 Agent Chat
  return (
    <div className="max-w-full">
      {agentName && (
        <div className="mb-1 text-xs font-medium text-accent1">{agentName}</div>
      )}
      <div className="text-neutral6 text-ui-lg leading-ui-lg pt-2">
        {message.content ? (
          <MarkdownRenderer>{message.content}</MarkdownRenderer>
        ) : (
          <span className="text-neutral3">...</span>
        )}
      </div>
    </div>
  );
}

// ── Welcome — 匹配 ThreadWelcome 样式 ──────────────────────────────────

function TeamChatWelcome({
  teamName,
  defaultTarget,
  onStarterPrompt,
}: {
  teamName: string;
  defaultTarget?: string;
  onStarterPrompt: (text: string) => void;
}) {
  return (
    <div className="flex w-full grow flex-col items-center pt-[15vh]">
      <div className="flex size-12 items-center justify-center rounded-full bg-accent1/10">
        <Users className="size-6 text-accent1" />
      </div>
      <p className="mt-4 font-medium text-neutral6">向团队「{teamName}」发送消息开始对话</p>
      <p className="mt-1 text-sm text-neutral3">Supervisor 会自动委派成员 Agent 协同分析</p>

      {/* 快捷输入 */}
      <div className="mt-6 flex flex-wrap gap-2">
        {defaultTarget && (
          <button
            onClick={() => onStarterPrompt(`分析 ${defaultTarget} 的投资价值`)}
            className="rounded-lg border border-border1 bg-surface3 px-3 py-1.5 text-xs text-neutral4 transition-colors hover:border-accent1 hover:text-accent1"
          >
            分析 {defaultTarget}
          </button>
        )}
        <button
          onClick={() => onStarterPrompt('请给出当前的分析建议')}
          className="rounded-lg border border-border1 bg-surface3 px-3 py-1.5 text-xs text-neutral4 transition-colors hover:border-accent1 hover:text-accent1"
        >
          给出分析建议
        </button>
        <button
          onClick={() => onStarterPrompt('有哪些主要风险需要关注？')}
          className="rounded-lg border border-border1 bg-surface3 px-3 py-1.5 text-xs text-neutral4 transition-colors hover:border-accent1 hover:text-accent1"
        >
          主要风险？
        </button>
      </div>
    </div>
  );
}

// ── Stop Icon — 复用 Agent Chat 的样式 ─────────────────────────────────

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
