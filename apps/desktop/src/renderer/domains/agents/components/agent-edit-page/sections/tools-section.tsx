import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@mastra/playground-ui/components/Collapsible';
import { Combobox } from '@mastra/playground-ui/components/Combobox';
import { ToolsIcon } from '@mastra/playground-ui/icons/ToolsIcon';
import { ChevronRight } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { Control } from 'react-hook-form';
import { Controller, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import type { AgentFormValues, EntityConfig } from '../utils/form-validation';
import { EntityAccordionItem } from '@/domains/cms';
import { SectionTitle } from '@/domains/cms/components/section/section-title';
import { useToolConfigs } from '@/lib/tool-api';

interface ToolsSectionProps {
  control: Control<AgentFormValues>;
  error?: string;
  readOnly?: boolean;
}

export function ToolsSection({ control, error, readOnly = false }: ToolsSectionProps) {
  const { t } = useTranslation('agents');
  const [isOpen, setIsOpen] = useState(false);
  const { data: toolConfigsData, isLoading } = useToolConfigs();
  const selectedTools = useWatch({ control, name: 'tools' });
  const count = Object.keys(selectedTools || {}).length;

  // 统一从 ToolConfig DB 获取工具列表
  const options = useMemo(() => {
    if (!toolConfigsData?.tools) return [];
    return toolConfigsData.tools.map(tc => {
      const enabled = tc.enabled;
      const label = enabled ? tc.name : `${tc.name} (已禁用)`;
      const description = enabled ? tc.description : `${tc.description} [已禁用]`;
      return {
        value: tc.id,
        label,
        description,
      };
    });
  }, [toolConfigsData]);

  const getOriginalDescription = (id: string): string => {
    const option = options.find(opt => opt.value === id);
    return option?.description || '';
  };

  return (
    <div className="rounded-md border border-border1 bg-surface2">
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger className="flex items-center gap-1 w-full p-3 bg-surface3">
          <ChevronRight className="h-4 w-4 text-neutral3" />
          <SectionTitle icon={<ToolsIcon className="text-accent6" />}>
            {t('tools.title')}{count > 0 && <span className="text-neutral3 font-normal">({count})</span>}
          </SectionTitle>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="p-3 border-t border-border1">
            <Controller
              name="tools"
              control={control}
              render={({ field }) => {
                const selectedIds = Object.keys(field.value || {});
                const selectedOptions = selectedIds.map(id => {
                  const existing = options.find(opt => opt.value === id);
                  return existing || { value: id, label: id, description: field.value?.[id]?.description || '' };
                });

                const handleValueChange = (newIds: string[]) => {
                  const newValue: Record<string, EntityConfig> = {};
                  for (const id of newIds) {
                    newValue[id] = field.value?.[id] || {
                      description: getOriginalDescription(id),
                    };
                  }
                  field.onChange(newValue);
                };

                const handleDescriptionChange = (toolId: string, description: string) => {
                  field.onChange({
                    ...field.value,
                    [toolId]: { ...field.value?.[toolId], description },
                  });
                };

                const handleRemove = (toolId: string) => {
                  const newValue = { ...field.value };
                  delete newValue[toolId];
                  field.onChange(newValue);
                };

                return (
                  <div className="flex flex-col gap-2">
                    <Combobox
                      multiple
                      options={options}
                      value={selectedIds}
                      onValueChange={handleValueChange}
                      placeholder={t('tools.selectPlaceholder')}
                      searchPlaceholder={t('tools.searchPlaceholder')}
                      emptyText={t('tools.emptyText')}
                      disabled={isLoading || readOnly}
                      error={error}
                    />
                    {selectedOptions.length > 0 && (
                      <div className="flex flex-col gap-3 mt-2">
                        {selectedOptions.map(tool => (
                          <EntityAccordionItem
                            key={tool.value}
                            id={tool.value}
                            name={tool.label}
                            icon={<ToolsIcon className="text-accent6" />}
                            description={field.value?.[tool.value]?.description || ''}
                            onDescriptionChange={
                              readOnly ? undefined : desc => handleDescriptionChange(tool.value, desc)
                            }
                            onRemove={readOnly ? undefined : () => handleRemove(tool.value)}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                );
              }}
            />
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
