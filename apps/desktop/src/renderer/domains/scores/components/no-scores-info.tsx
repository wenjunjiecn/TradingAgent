import { EmptyState } from '@mastra/playground-ui/components/EmptyState';
import { CircleSlashIcon } from 'lucide-react';

export const NoScoresInfo = () => (
  <div className="flex h-full items-center justify-center">
    <EmptyState
      iconSlot={<CircleSlashIcon />}
      titleSlot="No scores yet"
      descriptionSlot="Scores will appear here once a scorer evaluates agents or workflows."
    />
  </div>
);
