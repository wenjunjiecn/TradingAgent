import { EmptyState } from '@mastra/playground-ui/components/EmptyState';
import { CircleSlashIcon } from 'lucide-react';

export const NoMCPServersInfo = () => (
  <div className="flex h-full items-center justify-center">
    <EmptyState
      iconSlot={<CircleSlashIcon />}
      titleSlot="No MCP Servers yet"
      descriptionSlot="MCP servers are not configured yet."
    />
  </div>
);
