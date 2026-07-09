import type { StoredSkillResponse } from '@mastra/client-js';
import { Button } from '@mastra/playground-ui/components/Button';
import { EmptyState } from '@mastra/playground-ui/components/EmptyState';
import { Entity, EntityContent, EntityName, EntityDescription } from '@mastra/playground-ui/components/Entity';
import { ScrollArea } from '@mastra/playground-ui/components/ScrollArea';
import { Searchbar } from '@mastra/playground-ui/components/Searchbar';
import { Switch } from '@mastra/playground-ui/components/Switch';
import { Plus, Drill } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useWatch } from 'react-hook-form';

import { useAgentEditFormContext } from '../../context/agent-edit-form-context';
import { useStoredSkills } from '../../hooks/use-stored-skills';
import { SkillEditDialog } from './skill-edit-dialog';
import { SectionHeader } from '@/domains/cms';

export function SkillsPage() {
  const { t } = useTranslation('agents');
  const { form, readOnly } = useAgentEditFormContext();
  const { control } = form;
  const { data: storedSkillsResponse, isLoading } = useStoredSkills();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [search, setSearch] = useState('');

  const selectedSkills = useWatch({ control, name: 'skills' }) ?? {};
  const selectedSkillIds = Object.keys(selectedSkills);

  const storedSkills = storedSkillsResponse?.skills ?? [];

  const getSkillDescription = (skillId: string): string => {
    const skill = storedSkills.find(s => s.id === skillId);
    return skill?.description || '';
  };

  const handleToggleSkill = (skillId: string) => {
    const currentSkills = form.getValues('skills') ?? {};
    const isSelected = currentSkills[skillId] !== undefined;
    if (isSelected) {
      const next = { ...currentSkills };
      delete next[skillId];
      form.setValue('skills', next);
    } else {
      form.setValue('skills', {
        ...currentSkills,
        [skillId]: { description: getSkillDescription(skillId) },
      });
    }
  };

  const handleSkillCreated = (skill: StoredSkillResponse, workspaceId: string) => {
    const currentSkills = form.getValues('skills') ?? {};
    form.setValue('skills', {
      ...currentSkills,
      [skill.id]: { description: skill.description || '' },
    });
    form.setValue('workspace', { type: 'id', workspaceId });
    setDialogOpen(false);
  };

  const filteredSkills = storedSkills.filter(skill => skill.name.toLowerCase().includes(search.toLowerCase()));

  const totalCount = selectedSkillIds.length;

  return (
    <ScrollArea className="h-full">
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <SectionHeader
            title={t('skills.title')}
            subtitle={`${t('skills.subtitle')}${totalCount > 0 ? ` ${t('skills.selectedSuffix', { count: totalCount })}` : ''}`}
          />

          {!readOnly && (
            <Button variant="outline" size="sm" onClick={() => setDialogOpen(true)}>
              <Plus className="size-3" />
              {t('skills.addSkill')}
            </Button>
          )}
        </div>

        <Searchbar onSearch={setSearch} label={t('skills.search')} placeholder={t('skills.search')} />

        {filteredSkills.length > 0 && (
          <div className="flex flex-col gap-2">
            {filteredSkills.map(skill => (
              <Entity key={skill.id} className="bg-surface2">
                <EntityContent>
                  <EntityName>{skill.name}</EntityName>
                  <EntityDescription>{skill.description || t('skills.noDescription')}</EntityDescription>
                </EntityContent>

                {!readOnly && (
                  <Switch
                    checked={selectedSkillIds.includes(skill.id)}
                    onCheckedChange={() => handleToggleSkill(skill.id)}
                  />
                )}
              </Entity>
            ))}
          </div>
        )}

        {!isLoading && storedSkills.length === 0 && (
          <div className="py-12">
            <EmptyState
              iconSlot={<Drill height={40} width={40} />}
              titleSlot={t('skills.emptyTitle')}
              descriptionSlot={t('skills.emptyDesc')}
              actionSlot={
                !readOnly ? (
                  <Button onClick={() => setDialogOpen(true)}>
                    <Plus />
                    {t('skills.addSkill')}
                  </Button>
                ) : undefined
              }
            />
          </div>
        )}
      </div>

      <SkillEditDialog isOpen={dialogOpen} onClose={() => setDialogOpen(false)} onSkillCreated={handleSkillCreated} />
    </ScrollArea>
  );
}
