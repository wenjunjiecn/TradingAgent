import { Button } from '@mastra/playground-ui/components/Button';
import { EmptyState } from '@mastra/playground-ui/components/EmptyState';
import { CircleSlashIcon, ExternalLinkIcon, Plus } from 'lucide-react';
import { useLinkComponent } from '@/lib/framework';

export const NoAgentsInfo = () => {
  const { Link, paths } = useLinkComponent();

  return (
    <div className="flex h-full items-center justify-center ">
      <EmptyState
        iconSlot={<CircleSlashIcon />}
        titleSlot="No Agents yet"
        descriptionSlot="Configure agents in code or create one here to get started."
        actionSlot={
          <div className="flex items-center gap-3">
            <Button as={Link} to={paths.cmsAgentCreateLink()} variant="primary">
              <Plus className="mr-1.5 h-4 w-4" />
              Create agent
            </Button>
            <Button
              variant="ghost"
              as="a"
              href="https://mastra.ai/docs/agents/overview"
              target="_blank"
              rel="noopener noreferrer"
            >
              Agents Documentation <ExternalLinkIcon className="ml-1.5 h-3.5 w-3.5" />
            </Button>
          </div>
        }
      />
    </div>
  );
};
