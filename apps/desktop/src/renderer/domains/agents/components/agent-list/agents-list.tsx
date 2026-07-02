import type { GetAgentResponse } from '@mastra/client-js';
import { truncateString } from '@mastra/playground-ui/utils/truncate-string';
import {
  ArrowRight,
  Bot,
  BrainCircuit,
  ChartCandlestick,
  CircleDot,
  Clock3,
  Database,
  Gauge,
  Newspaper,
  ShieldAlert,
  Sparkles,
} from 'lucide-react';
import type { ElementType } from 'react';
import { useMemo } from 'react';
import { extractPrompt } from '../../utils/extractPrompt';
import { ProviderLogo } from '../agent-metadata/provider-logo';
import { useLinkComponent } from '@/lib/framework';
import { cn } from '@/lib/utils';

export interface AgentsListProps {
  agents: Record<string, GetAgentResponse>;
  isLoading: boolean;
  search?: string;
}

type AgentRoleMetadata = {
  role?: string;
  summary?: string;
  operatingMode?: string;
  focus: string[];
  badges: string[];
};

type AgentVisual = {
  Icon: ElementType<{ className?: string }>;
  borderClassName: string;
  iconClassName: string;
  glowClassName: string;
};

const defaultVisual: AgentVisual = {
  Icon: Bot,
  borderClassName: 'border-l-neutral4',
  iconClassName: 'bg-neutral5/10 text-neutral5',
  glowClassName: 'bg-neutral5/10',
};

const visualByAgentId: Record<string, AgentVisual> = {
  'trading-agent': {
    Icon: BrainCircuit,
    borderClassName: 'border-l-sky-400/70',
    iconClassName: 'bg-sky-400/10 text-sky-200',
    glowClassName: 'bg-sky-400/10',
  },
  'market-analysis-agent': {
    Icon: ChartCandlestick,
    borderClassName: 'border-l-emerald-400/70',
    iconClassName: 'bg-emerald-400/10 text-emerald-200',
    glowClassName: 'bg-emerald-400/10',
  },
  'sentiment-analysis-agent': {
    Icon: Newspaper,
    borderClassName: 'border-l-amber-300/70',
    iconClassName: 'bg-amber-300/10 text-amber-100',
    glowClassName: 'bg-amber-300/10',
  },
  'risk-analysis-agent': {
    Icon: ShieldAlert,
    borderClassName: 'border-l-rose-400/70',
    iconClassName: 'bg-rose-400/10 text-rose-200',
    glowClassName: 'bg-rose-400/10',
  },
};

const getString = (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim() : undefined);

const getStringArray = (value: unknown) =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0) : [];

function getAgentRoleMetadata(agent: GetAgentResponse): AgentRoleMetadata {
  const metadata = agent.metadata ?? {};
  const instructions = extractPrompt(agent.instructions);
  return {
    role: getString(metadata.role) ?? getString(agent.description) ?? '研究助理',
    summary:
      getString(metadata.summary) ??
      getString(agent.description) ??
      truncateString(instructions.replace(/\s+/g, ' '), 120),
    operatingMode: getString(metadata.operatingMode) ?? '按需协作',
    focus: getStringArray(metadata.focus),
    badges: getStringArray(metadata.badges),
  };
}

function AgentCardSkeleton() {
  return (
    <div className="min-h-[17rem] rounded-lg border border-border1 bg-surface3/60 p-4">
      <div className="animate-pulse space-y-5">
        <div className="flex items-start gap-3">
          <div className="size-10 rounded-lg bg-surface5" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-2/5 rounded bg-surface5" />
            <div className="h-3 w-1/3 rounded bg-surface4" />
          </div>
        </div>
        <div className="space-y-2">
          <div className="h-3 w-full rounded bg-surface4" />
          <div className="h-3 w-5/6 rounded bg-surface4" />
          <div className="h-3 w-2/3 rounded bg-surface4" />
        </div>
        <div className="flex gap-2">
          <div className="h-6 w-20 rounded bg-surface4" />
          <div className="h-6 w-24 rounded bg-surface4" />
        </div>
        <div className="h-px bg-border1" />
        <div className="grid grid-cols-3 gap-2">
          <div className="h-9 rounded bg-surface4" />
          <div className="h-9 rounded bg-surface4" />
          <div className="h-9 rounded bg-surface4" />
        </div>
      </div>
    </div>
  );
}

function AgentCapability({
  icon: Icon,
  label,
  value,
}: {
  icon: ElementType<{ className?: string }>;
  label: string;
  value: string | number;
}) {
  return (
    <div className="min-w-0 rounded-md border border-border1 bg-surface2/70 px-2.5 py-2">
      <div className="mb-1 flex items-center gap-1.5 text-[11px] leading-none text-neutral3">
        <Icon className="size-3.5 shrink-0" />
        <span className="truncate">{label}</span>
      </div>
      <div className="truncate font-mono text-xs leading-none text-neutral6">{value}</div>
    </div>
  );
}

export function AgentsList({ agents, isLoading, search = '' }: AgentsListProps) {
  const { paths, Link } = useLinkComponent();

  const agentData = useMemo(() => Object.values(agents ?? {}), [agents]);

  const filteredData = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return agentData;

    return agentData.filter(agent => {
      const role = getAgentRoleMetadata(agent);
      const searchableText = [
        agent.name,
        agent.description,
        role.role,
        role.summary,
        role.operatingMode,
        role.focus.join(' '),
        role.badges.join(' '),
        extractPrompt(agent.instructions),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return searchableText.includes(term);
    });
  }, [agentData, search]);

  if (isLoading) {
    return (
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 4 }, (_, index) => (
          <AgentCardSkeleton key={index} />
        ))}
      </div>
    );
  }

  if (filteredData.length === 0 && search) {
    return (
      <div className="rounded-lg border border-dashed border-border1 bg-surface3/40 px-5 py-10 text-center">
        <p className="text-sm font-medium text-neutral6">没有找到匹配的 agent</p>
        <p className="mt-1 text-xs text-neutral3">可以按角色、能力标签、模型或说明继续搜索。</p>
      </div>
    );
  }

  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {filteredData.map(agent => {
        const role = getAgentRoleMetadata(agent);
        const visual = visualByAgentId[agent.id] ?? defaultVisual;
        const toolsCount = Object.keys(agent.tools ?? {}).length;
        const workflowsCount = Object.keys(agent.workflows ?? {}).length;
        const agentsCount = Object.keys(agent.agents ?? {}).length;
        const focusItems = role.focus.length > 0 ? role.focus.slice(0, 3) : ['研究判断', '风险提示', '下一步问题'];
        const badgeItems = role.badges.length > 0 ? role.badges.slice(0, 3) : ['Agent', 'Research'];
        const Icon = visual.Icon;

        return (
          <Link
            key={agent.id}
            href={paths.agentLink(agent.id)}
            className={cn(
              'group relative min-h-[17rem] overflow-hidden rounded-lg border border-l-2 border-border1 bg-surface3/75 p-4 outline-none',
              'transition-[background-color,border-color,transform] duration-150 ease-out hover:-translate-y-0.5 hover:border-neutral3 hover:bg-surface4/70',
              'focus-visible:ring-2 focus-visible:ring-accent1/60 focus-visible:ring-offset-2 focus-visible:ring-offset-surface1',
              visual.borderClassName,
            )}
          >
            <span
              aria-hidden="true"
              className={cn(
                'pointer-events-none absolute right-[-2.5rem] top-[-2.5rem] size-28 rounded-full blur-3xl transition-opacity duration-150 group-hover:opacity-80',
                visual.glowClassName,
              )}
            />
            <article className="relative flex h-full flex-col">
              <div className="flex items-start gap-3">
                <div className={cn('grid size-10 shrink-0 place-items-center rounded-lg', visual.iconClassName)}>
                  <Icon className="size-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="truncate text-base font-semibold leading-6 text-neutral6">{agent.name}</h2>
                      <p className="mt-0.5 truncate text-xs leading-5 text-neutral3">{role.role}</p>
                    </div>
                    <ArrowRight className="mt-1 size-4 shrink-0 text-neutral3 transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-neutral6" />
                  </div>
                </div>
              </div>

              <p className="mt-4 min-h-12 text-sm leading-6 text-neutral4">{role.summary}</p>

              <div className="mt-4 flex flex-wrap gap-1.5">
                {badgeItems.map(item => (
                  <span
                    key={item}
                    className="rounded-md border border-border1 bg-surface2/80 px-2 py-1 text-[11px] leading-none text-neutral4"
                  >
                    {item}
                  </span>
                ))}
              </div>

              <div className="mt-4 space-y-2">
                {focusItems.map(item => (
                  <div key={item} className="flex items-center gap-2 text-xs leading-5 text-neutral4">
                    <CircleDot className="size-3 shrink-0 text-neutral3" />
                    <span className="truncate">{item}</span>
                  </div>
                ))}
              </div>

              <div className="mt-auto pt-5">
                <div className="mb-3 flex items-center gap-2 text-xs leading-5 text-neutral3">
                  <Clock3 className="size-3.5 shrink-0" />
                  <span className="truncate">{role.operatingMode}</span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <AgentCapability icon={Database} label="工具" value={toolsCount} />
                  <AgentCapability icon={Gauge} label="流程" value={workflowsCount} />
                  <AgentCapability icon={Sparkles} label="协作" value={agentsCount} />
                </div>
                <div className="mt-3 flex items-center gap-2 text-xs leading-5 text-neutral3">
                  {agent.provider && <ProviderLogo providerId={agent.provider} className="size-4 dark:invert" />}
                  <span className="truncate">{agent.modelId || 'N/A'}</span>
                </div>
              </div>
            </article>
          </Link>
        );
      })}
    </div>
  );
}
