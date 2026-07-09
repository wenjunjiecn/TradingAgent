import { Badge } from '@mastra/playground-ui/components/Badge';
import { Button } from '@mastra/playground-ui/components/Button';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface VersionIndicatorProps {
  versionNumber: number;
  onClose: () => void;
}

export function VersionIndicator({ versionNumber, onClose }: VersionIndicatorProps) {
  const { t } = useTranslation('agents');
  return (
    <div className="flex items-center gap-1.5">
      <Badge variant="info">{t('version.viewing', { number: versionNumber })}</Badge>
      <Button variant="ghost" size="icon-sm" onClick={onClose} tooltip={t('version.backToLatest')}>
        <X />
      </Button>
    </div>
  );
}

// Keep the old export for backwards compatibility during transition
export const VersionPreviewBanner = VersionIndicator;
