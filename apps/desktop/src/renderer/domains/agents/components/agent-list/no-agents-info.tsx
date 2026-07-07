import { Button } from '@mastra/playground-ui/components/Button';
import { EmptyState } from '@mastra/playground-ui/components/EmptyState';
import { CircleSlashIcon, Plus } from 'lucide-react';
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
          <Button as={Link} to={paths.cmsAgentCreateLink()} variant="primary">
            <Plus className="mr-1.5 h-4 w-4" />
            Create agent
          </Button>
        }
      />
    </div>
  );
};
