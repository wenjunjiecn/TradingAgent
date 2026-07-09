import { Blocks } from 'lucide-react';
import type { UseFormReturn } from 'react-hook-form';
import { Controller } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { AgentCMSBlocks } from '../agent-cms-blocks';
import type { AgentFormValues } from './utils/form-validation';
import { SectionHeader } from '@/domains/cms';

interface AgentEditMainProps {
  form: UseFormReturn<AgentFormValues>;
  readOnly?: boolean;
}

export function AgentEditMainContentBlocks({ form, readOnly: _readOnly = false }: AgentEditMainProps) {
  const { t } = useTranslation('agents');
  const schema = form.watch('variables');

  return (
    <div className="grid grid-rows-[auto_1fr] gap-6 h-full px-4 pb-4">
      <SectionHeader title={t('instructionBlocks.title')} subtitle={t('instructionBlocks.subtitle')} icon={<Blocks />} />

      <div className="h-full overflow-y-auto">
        <Controller
          name="instructionBlocks"
          control={form.control}
          defaultValue={[]}
          render={({ field }) => (
            <AgentCMSBlocks
              items={field.value ?? []}
              onChange={field.onChange}
              placeholder={t('instructionBlocks.contentPlaceholder')}
              schema={schema}
            />
          )}
        />
      </div>
    </div>
  );
}
