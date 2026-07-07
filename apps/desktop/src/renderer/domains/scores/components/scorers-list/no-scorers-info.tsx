import { EmptyState } from '@mastra/playground-ui/components/EmptyState';
import { CircleSlashIcon } from 'lucide-react';

export const NoScorersInfo = () => (
  <div className="flex h-full items-center justify-center">
    <EmptyState
      iconSlot={<CircleSlashIcon />}
      titleSlot="No Scorers yet"
      descriptionSlot="Configure scorers in code to get started."
    />
  </div>
);
