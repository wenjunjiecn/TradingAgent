import { ErrorState } from '@mastra/playground-ui/components/ErrorState';
import { ListSearch } from '@mastra/playground-ui/components/ListSearch';
import { NoDataPageLayout, PageLayout } from '@mastra/playground-ui/components/PageLayout';
import { PermissionDenied } from '@mastra/playground-ui/components/PermissionDenied';
import { SessionExpired } from '@mastra/playground-ui/components/SessionExpired';
import { is401UnauthorizedError, is403ForbiddenError } from '@mastra/playground-ui/utils/errors';
import { useState } from 'react';
import { AgentHeaderCreateAction } from '@/domains/agents/agent-header-actions';
import { AgentsList } from '@/domains/agents/components/agent-list/agents-list';
import { NoAgentsInfo } from '@/domains/agents/components/agent-list/no-agents-info';
import { useAgents } from '@/domains/agents/hooks/use-agents';

function Agents() {
  const { data: agents = {}, isLoading, error } = useAgents();
  const [search, setSearch] = useState('');

  if (error && is401UnauthorizedError(error)) {
    return (
      <NoDataPageLayout>
        <SessionExpired />
      </NoDataPageLayout>
    );
  }

  if (error && is403ForbiddenError(error)) {
    return (
      <NoDataPageLayout>
        <PermissionDenied resource="agents" />
      </NoDataPageLayout>
    );
  }

  if (error) {
    return (
      <NoDataPageLayout>
        <ErrorState title="Failed to load agents" message={error.message} />
      </NoDataPageLayout>
    );
  }

  if (Object.keys(agents).length === 0 && !isLoading) {
    return (
      <NoDataPageLayout>
        <NoAgentsInfo />
      </NoDataPageLayout>
    );
  }

  return (
    <PageLayout className="gap-0 p-0">
      <AgentHeaderCreateAction />
      <PageLayout.TopArea className="border-b border-border1 bg-surface2/40 p-5 pb-5 lg:p-6 lg:pb-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="rounded-md border border-border1 bg-surface3 px-2 py-1 text-[11px] font-medium leading-none text-neutral3">
                {Object.keys(agents).length} agents
              </span>
              <span className="rounded-md border border-border1 bg-surface3 px-2 py-1 text-[11px] font-medium leading-none text-neutral3">
                trading research
              </span>
            </div>
            <h1 className="text-2xl font-semibold leading-8 text-neutral6">Agent配置</h1>
            <p className="mt-1 text-sm leading-6 text-neutral3">市场结构、情绪面、技术信号、风险检查</p>
          </div>
          <div className="w-full max-w-[28rem]">
            <ListSearch onSearch={setSearch} label="Filter agents" placeholder="搜索角色、能力或说明" />
          </div>
        </div>
      </PageLayout.TopArea>

      <div className="p-5 lg:p-6">
        <AgentsList agents={agents} isLoading={isLoading} search={search} />
      </div>
    </PageLayout>
  );
}

export { Agents };

export default Agents;
