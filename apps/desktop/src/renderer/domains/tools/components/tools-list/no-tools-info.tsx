import { EmptyState } from '@mastra/playground-ui/components/EmptyState';
import { CircleSlashIcon } from 'lucide-react';

export const NoToolsInfo = () => (
  <div className="flex h-full items-center justify-center">
    <EmptyState
      iconSlot={<CircleSlashIcon />}
      titleSlot="No Tools yet"
      descriptionSlot="Mastra tools are not configured yet."
    />
  </div>
);
