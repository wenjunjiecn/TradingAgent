import { EmptyState } from '@mastra/playground-ui/components/EmptyState';
import { CircleSlashIcon } from 'lucide-react';

export const NoWorkflowsInfo = () => (
  <div className="flex h-full items-center justify-center">
    <EmptyState
      iconSlot={<CircleSlashIcon />}
      titleSlot="No Workflows yet"
      descriptionSlot="Mastra workflows are not configured yet."
    />
  </div>
);
