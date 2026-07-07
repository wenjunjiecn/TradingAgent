import { Breadcrumb, Crumb } from '@mastra/playground-ui/components/Breadcrumb';
import { Header } from '@mastra/playground-ui/components/Header';
import { AgentIcon } from '@mastra/playground-ui/icons/AgentIcon';
import { Icon } from '@mastra/playground-ui/icons/Icon';
import { Link } from 'react-router';
import { AgentCombobox } from '@/domains/agents/components/agent-combobox';

export function AgentHeader({ agentId }: { agentId: string }) {
  return (
    <Header border={false}>
      <Breadcrumb>
        <Crumb as={Link} to={`/agents`}>
          <Icon>
            <AgentIcon />
          </Icon>
          Agents
        </Crumb>
        <Crumb as="span" to="" isCurrent>
          <AgentCombobox value={agentId} variant="ghost" size="sm" />
        </Crumb>
      </Breadcrumb>

    </Header>
  );
}
