import { Button } from '@mastra/playground-ui/components/Button';
import { EmptyState } from '@mastra/playground-ui/components/EmptyState';
import { Entity, EntityContent, EntityName, EntityDescription } from '@mastra/playground-ui/components/Entity';
import { Input } from '@mastra/playground-ui/components/Input';
import { Label } from '@mastra/playground-ui/components/Label';
import { ScrollArea } from '@mastra/playground-ui/components/ScrollArea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@mastra/playground-ui/components/Select';
import { Switch } from '@mastra/playground-ui/components/Switch';
import { MemoryIcon } from '@mastra/playground-ui/icons/MemoryIcon';
import { Controller, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { useAgentEditFormContext } from '../../context/agent-edit-form-context';
import { SectionHeader, SubSectionHeader } from '@/domains/cms';
import { useEmbedders } from '@/domains/embedders/hooks/use-embedders';
import { LLMProviders, LLMModels } from '@/domains/llm';
import { useVectors } from '@/domains/vectors/hooks/use-vectors';

export function MemoryPage() {
  const { t } = useTranslation('agents');
  const { form, readOnly } = useAgentEditFormContext();
  const { control } = form;
  const isEnabled = useWatch({ control, name: 'memory.enabled' }) ?? false;

  return (
    <ScrollArea className="h-full">
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <SectionHeader
            title={t('memory.title')}
            subtitle={t('memory.subtitle')}
          />
          {!readOnly && isEnabled && (
            <Controller
              name="memory.enabled"
              control={control}
              render={({ field }) => <Switch checked={field.value ?? false} onCheckedChange={field.onChange} />}
            />
          )}
        </div>

        {!isEnabled && (
          <div className="py-12">
            <EmptyState
              iconSlot={<MemoryIcon height={40} width={40} />}
              titleSlot={t('memory.notEnabledTitle')}
              descriptionSlot={t('memory.notEnabledDesc')}
              actionSlot={
                !readOnly && (
                  <Controller
                    name="memory.enabled"
                    control={control}
                    render={({ field }) => (
                      <Button variant="default" size="sm" onClick={() => field.onChange(true)}>
                        {t('memory.enableMemory')}
                      </Button>
                    )}
                  />
                )
              }
            />
          </div>
        )}

        {isEnabled && (
          <div className="flex flex-col gap-2">
            <ObservationalMemoryEntity />
            <LastMessagesEntity />
            <SemanticRecallEntity />
            <ReadOnlyEntity />
          </div>
        )}
      </div>
    </ScrollArea>
  );
}

function LastMessagesEntity() {
  const { t } = useTranslation('agents');
  const { form, readOnly } = useAgentEditFormContext();
  const { control } = form;
  const lastMessages = useWatch({ control, name: 'memory.lastMessages' });
  const lastMessagesEnabled = lastMessages !== false;

  return (
    <Entity className="flex-col gap-0 p-0 overflow-hidden">
      <div className="flex gap-3 py-3 px-4">
        <EntityContent>
          <EntityName>{t('memory.messageHistory')}</EntityName>
          <EntityDescription>{t('memory.messageHistoryDesc')}</EntityDescription>
        </EntityContent>

        {!readOnly && (
          <Controller
            name="memory.lastMessages"
            control={control}
            render={({ field }) => (
              <Switch
                checked={lastMessagesEnabled}
                onCheckedChange={checked => {
                  field.onChange(checked ? 40 : false);
                  if (checked) {
                    form.setValue('memory.observationalMemory.enabled', false, { shouldDirty: true });
                  }
                }}
              />
            )}
          />
        )}
      </div>

      {lastMessagesEnabled && (
        <div className="bg-surface2 border-t border-border1 p-4">
          <Controller
            name="memory.lastMessages"
            control={control}
            render={({ field }) => (
              <Input
                id="memory-last-messages"
                type="number"
                min="1"
                step="1"
                value={field.value === false ? '' : (field.value ?? 40)}
                onChange={e => {
                  const value = e.target.value;
                  field.onChange(value === '' ? false : parseInt(value, 10));
                }}
                placeholder="40"
                className="bg-surface3"
                disabled={readOnly}
              />
            )}
          />
        </div>
      )}
    </Entity>
  );
}

function SemanticRecallEntity() {
  const { t } = useTranslation('agents');
  const { form, readOnly } = useAgentEditFormContext();
  const { control } = form;
  const semanticRecallEnabled = useWatch({ control, name: 'memory.semanticRecall' }) ?? false;

  const { data: vectorsData } = useVectors();
  const { data: embeddersData } = useEmbedders();
  const vectors = vectorsData?.vectors ?? [];
  const embedders = embeddersData?.embedders ?? [];

  return (
    <Entity className="flex-col gap-0 p-0 overflow-hidden">
      <div className="flex gap-3 py-3 px-4">
        <EntityContent>
          <EntityName>{t('memory.semanticRecall')}</EntityName>
          <EntityDescription>{t('memory.semanticRecallDesc')}</EntityDescription>
        </EntityContent>

        {!readOnly && (
          <Controller
            name="memory.semanticRecall"
            control={control}
            render={({ field }) => <Switch checked={field.value ?? false} onCheckedChange={field.onChange} />}
          />
        )}
      </div>

      {semanticRecallEnabled && (
        <div className="bg-surface2 border-t border-border1 p-4 grid grid-cols-2 gap-4">
          <Controller
            name="memory.vector"
            control={control}
            render={({ field }) => (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="memory-vector" className="text-sm text-neutral5">
                  {t('memory.vectorStore')}
                </Label>
                <span className="text-xs text-neutral2">{t('memory.vectorStoreDesc')}</span>
                <Select value={field.value ?? ''} onValueChange={field.onChange} disabled={readOnly}>
                  <SelectTrigger id="memory-vector" className="bg-surface3">
                    <SelectValue placeholder={t('memory.vectorStorePlaceholder')} />
                  </SelectTrigger>
                  <SelectContent>
                    {vectors.map(vector => (
                      <SelectItem key={vector.id} value={vector.id}>
                        {vector.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          />

          <Controller
            name="memory.embedder"
            control={control}
            render={({ field }) => (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="memory-embedder" className="text-sm text-neutral5">
                  {t('memory.embedderModel')}
                </Label>
                <span className="text-xs text-neutral2">{t('memory.embedderModelDesc')}</span>
                <Select value={field.value ?? ''} onValueChange={field.onChange} disabled={readOnly}>
                  <SelectTrigger id="memory-embedder" className="bg-surface3">
                    <SelectValue placeholder={t('memory.embedderModelPlaceholder')} />
                  </SelectTrigger>
                  <SelectContent>
                    {embedders.map(embedder => (
                      <SelectItem key={embedder.id} value={embedder.id}>
                        {embedder.name} ({embedder.provider})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          />
        </div>
      )}
    </Entity>
  );
}

function ReadOnlyEntity() {
  const { t } = useTranslation('agents');
  const { form, readOnly } = useAgentEditFormContext();
  const { control } = form;

  return (
    <Entity>
      <EntityContent>
        <EntityName>{t('memory.readOnly')}</EntityName>
        <EntityDescription>{t('memory.readOnlyDesc')}</EntityDescription>
      </EntityContent>

      {!readOnly && (
        <Controller
          name="memory.readOnly"
          control={control}
          render={({ field }) => <Switch checked={field.value ?? false} onCheckedChange={field.onChange} />}
        />
      )}
    </Entity>
  );
}

function ObservationalMemoryEntity() {
  const { t } = useTranslation('agents');
  const { form, readOnly } = useAgentEditFormContext();
  const { control } = form;
  const observationalMemoryEnabled = useWatch({ control, name: 'memory.observationalMemory.enabled' }) ?? false;

  return (
    <Entity className="flex-col gap-0 p-0 overflow-hidden">
      <div className="flex gap-3 py-3 px-4">
        <EntityContent>
          <EntityName>{t('memory.observationalMemory')}</EntityName>
          <EntityDescription>
            {t('memory.observationalMemoryDesc')}
          </EntityDescription>
        </EntityContent>

        {!readOnly && (
          <Controller
            name="memory.observationalMemory.enabled"
            control={control}
            render={({ field }) => (
              <Switch
                checked={field.value ?? false}
                onCheckedChange={checked => {
                  field.onChange(checked);
                  if (checked) {
                    form.setValue('memory.lastMessages', false, { shouldDirty: true });
                  }
                }}
              />
            )}
          />
        )}
      </div>

      {observationalMemoryEnabled && (
        <div className="bg-surface2 border-t border-border1 p-4">
          <ObservationalMemoryFields />
        </div>
      )}
    </Entity>
  );
}

function ObservationalMemoryFields() {
  const { t } = useTranslation('agents');
  const { form, readOnly } = useAgentEditFormContext();
  const { control, setValue } = form;
  const omProvider = useWatch({ control, name: 'memory.observationalMemory.model.provider' }) ?? '';
  const observerProvider = useWatch({ control, name: 'memory.observationalMemory.observation.model.provider' }) ?? '';
  const reflectorProvider = useWatch({ control, name: 'memory.observationalMemory.reflection.model.provider' }) ?? '';

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <Label className="text-sm text-neutral5">{t('memory.provider')}</Label>
          <span className="text-xs text-neutral2">{t('memory.providerDesc')}</span>
          <Controller
            name="memory.observationalMemory.model.provider"
            control={control}
            render={({ field }) => (
              <div className={readOnly ? 'pointer-events-none opacity-60' : ''}>
                <LLMProviders
                  value={field.value ?? ''}
                  onValueChange={v => {
                    field.onChange(v);
                    setValue('memory.observationalMemory.model.name', '', { shouldDirty: true });
                  }}
                />
              </div>
            )}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label className="text-sm text-neutral5">{t('memory.model')}</Label>
          <span className="text-xs text-neutral2">{t('memory.modelDesc')}</span>
          <Controller
            name="memory.observationalMemory.model.name"
            control={control}
            render={({ field }) => (
              <div className={readOnly ? 'pointer-events-none opacity-60' : ''}>
                <LLMModels value={field.value ?? ''} onValueChange={field.onChange} llmId={omProvider} />
              </div>
            )}
          />
        </div>

        <Controller
          name="memory.observationalMemory.scope"
          control={control}
          render={({ field }) => (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="memory-om-scope" className="text-sm text-neutral5">
                {t('memory.scope')}
              </Label>
              <span className="text-xs text-neutral2">
                {t('memory.scopeDesc')}
              </span>
              <Select value={field.value ?? 'thread'} onValueChange={field.onChange} disabled={readOnly}>
                <SelectTrigger id="memory-om-scope" className="bg-surface3">
                  <SelectValue placeholder={t('memory.scopePlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="thread">{t('memory.scopeThread')}</SelectItem>
                  <SelectItem value="resource">{t('memory.scopeResource')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        />

        <Controller
          name="memory.observationalMemory.shareTokenBudget"
          control={control}
          render={({ field }) => (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="memory-om-share-budget" className="text-sm text-neutral5">
                {t('memory.shareTokenBudget')}
              </Label>
              <span className="text-xs text-neutral2">{t('memory.shareTokenBudgetDesc')}</span>
              <Switch
                id="memory-om-share-budget"
                checked={field.value ?? false}
                onCheckedChange={field.onChange}
                disabled={readOnly}
              />
            </div>
          )}
        />
      </div>

      <div className="border-t border-border1 pt-4 mt-2">
        <ObserverFields observerProvider={observerProvider} />
      </div>
      <div className="border-t border-border1 pt-4 mt-2">
        <ReflectorFields reflectorProvider={reflectorProvider} />
      </div>
    </div>
  );
}

function ObserverFields({ observerProvider }: { observerProvider: string }) {
  const { t } = useTranslation('agents');
  const { form, readOnly } = useAgentEditFormContext();
  const { control, setValue } = form;

  return (
    <div className="flex flex-col gap-4">
      <SubSectionHeader title={t('memory.observer')} />
      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <Label className="text-sm text-neutral5">{t('memory.providerOverride')}</Label>
          <span className="text-xs text-neutral2">{t('memory.observerProviderOverrideDesc')}</span>
          <Controller
            name="memory.observationalMemory.observation.model.provider"
            control={control}
            render={({ field }) => (
              <div className={readOnly ? 'pointer-events-none opacity-60' : ''}>
                <LLMProviders
                  value={field.value ?? ''}
                  onValueChange={v => {
                    field.onChange(v);
                    setValue('memory.observationalMemory.observation.model.name', '', { shouldDirty: true });
                  }}
                />
              </div>
            )}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label className="text-sm text-neutral5">{t('memory.modelOverride')}</Label>
          <span className="text-xs text-neutral2">{t('memory.observerModelOverrideDesc')}</span>
          <Controller
            name="memory.observationalMemory.observation.model.name"
            control={control}
            render={({ field }) => (
              <div className={readOnly ? 'pointer-events-none opacity-60' : ''}>
                <LLMModels value={field.value ?? ''} onValueChange={field.onChange} llmId={observerProvider} />
              </div>
            )}
          />
        </div>

        <Controller
          name="memory.observationalMemory.observation.messageTokens"
          control={control}
          render={({ field }) => (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="memory-om-obs-msg-tokens" className="text-sm text-neutral5">
                {t('memory.messageTokens')}
              </Label>
              <span className="text-xs text-neutral2">
                {t('memory.messageTokensDesc')}
              </span>
              <Input
                id="memory-om-obs-msg-tokens"
                type="number"
                min="1"
                step="1000"
                value={field.value ?? ''}
                onChange={e => {
                  const v = e.target.value;
                  field.onChange(v === '' ? undefined : parseInt(v, 10));
                }}
                placeholder="30000"
                className="bg-surface3"
                disabled={readOnly}
              />
            </div>
          )}
        />

        <Controller
          name="memory.observationalMemory.observation.maxTokensPerBatch"
          control={control}
          render={({ field }) => (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="memory-om-obs-batch" className="text-sm text-neutral5">
                {t('memory.maxTokensPerBatch')}
              </Label>
              <span className="text-xs text-neutral2">
                {t('memory.maxTokensPerBatchDesc')}
              </span>
              <Input
                id="memory-om-obs-batch"
                type="number"
                min="1"
                step="1000"
                value={field.value ?? ''}
                onChange={e => {
                  const v = e.target.value;
                  field.onChange(v === '' ? undefined : parseInt(v, 10));
                }}
                placeholder="10000"
                className="bg-surface3"
                disabled={readOnly}
              />
            </div>
          )}
        />

        <Controller
          name="memory.observationalMemory.observation.bufferTokens"
          control={control}
          render={({ field }) => (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="memory-om-obs-buffer" className="text-sm text-neutral5">
                {t('memory.bufferTokens')}
              </Label>
              <span className="text-xs text-neutral2">
                {t('memory.bufferTokensDesc')}
              </span>
              <Input
                id="memory-om-obs-buffer"
                type="number"
                min="0"
                step="0.1"
                value={field.value === false ? '0' : (field.value ?? '')}
                onChange={e => {
                  const v = e.target.value;
                  if (v === '' || v === undefined) {
                    field.onChange(undefined);
                  } else {
                    const n = parseFloat(v);
                    field.onChange(n === 0 ? false : n);
                  }
                }}
                placeholder="0.2"
                className="bg-surface3"
                disabled={readOnly}
              />
            </div>
          )}
        />

        <Controller
          name="memory.observationalMemory.observation.bufferActivation"
          control={control}
          render={({ field }) => (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="memory-om-obs-buf-act" className="text-sm text-neutral5">
                {t('memory.bufferActivation')}
              </Label>
              <span className="text-xs text-neutral2">
                {t('memory.observerBufferActivationDesc')}
              </span>
              <Input
                id="memory-om-obs-buf-act"
                type="number"
                min="0"
                max="1"
                step="0.1"
                value={field.value ?? ''}
                onChange={e => {
                  const v = e.target.value;
                  field.onChange(v === '' ? undefined : parseFloat(v));
                }}
                placeholder="0.8"
                className="bg-surface3"
                disabled={readOnly}
              />
            </div>
          )}
        />

        <Controller
          name="memory.observationalMemory.observation.blockAfter"
          control={control}
          render={({ field }) => (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="memory-om-obs-block" className="text-sm text-neutral5">
                {t('memory.blockAfter')}
              </Label>
              <span className="text-xs text-neutral2">
                {t('memory.observerBlockAfterDesc')}
              </span>
              <Input
                id="memory-om-obs-block"
                type="number"
                min="0"
                step="0.1"
                value={field.value ?? ''}
                onChange={e => {
                  const v = e.target.value;
                  field.onChange(v === '' ? undefined : parseFloat(v));
                }}
                placeholder="1.2"
                className="bg-surface3"
                disabled={readOnly}
              />
            </div>
          )}
        />
      </div>
    </div>
  );
}

function ReflectorFields({ reflectorProvider }: { reflectorProvider: string }) {
  const { t } = useTranslation('agents');
  const { form, readOnly } = useAgentEditFormContext();
  const { control, setValue } = form;

  return (
    <div className="flex flex-col gap-4">
      <SubSectionHeader title={t('memory.reflector')} />
      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <Label className="text-sm text-neutral5">{t('memory.providerOverride')}</Label>
          <span className="text-xs text-neutral2">{t('memory.reflectorProviderOverrideDesc')}</span>
          <Controller
            name="memory.observationalMemory.reflection.model.provider"
            control={control}
            render={({ field }) => (
              <div className={readOnly ? 'pointer-events-none opacity-60' : ''}>
                <LLMProviders
                  value={field.value ?? ''}
                  onValueChange={v => {
                    field.onChange(v);
                    setValue('memory.observationalMemory.reflection.model.name', '', { shouldDirty: true });
                  }}
                />
              </div>
            )}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label className="text-sm text-neutral5">{t('memory.modelOverride')}</Label>
          <span className="text-xs text-neutral2">{t('memory.reflectorModelOverrideDesc')}</span>
          <Controller
            name="memory.observationalMemory.reflection.model.name"
            control={control}
            render={({ field }) => (
              <div className={readOnly ? 'pointer-events-none opacity-60' : ''}>
                <LLMModels value={field.value ?? ''} onValueChange={field.onChange} llmId={reflectorProvider} />
              </div>
            )}
          />
        </div>

        <Controller
          name="memory.observationalMemory.reflection.observationTokens"
          control={control}
          render={({ field }) => (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="memory-om-ref-obs-tokens" className="text-sm text-neutral5">
                {t('memory.observationTokens')}
              </Label>
              <span className="text-xs text-neutral2">
                {t('memory.observationTokensDesc')}
              </span>
              <Input
                id="memory-om-ref-obs-tokens"
                type="number"
                min="1"
                step="1000"
                value={field.value ?? ''}
                onChange={e => {
                  const v = e.target.value;
                  field.onChange(v === '' ? undefined : parseInt(v, 10));
                }}
                placeholder="40000"
                className="bg-surface3"
                disabled={readOnly}
              />
            </div>
          )}
        />

        <Controller
          name="memory.observationalMemory.reflection.blockAfter"
          control={control}
          render={({ field }) => (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="memory-om-ref-block" className="text-sm text-neutral5">
                {t('memory.blockAfter')}
              </Label>
              <span className="text-xs text-neutral2">
                {t('memory.reflectorBlockAfterDesc')}
              </span>
              <Input
                id="memory-om-ref-block"
                type="number"
                min="0"
                step="0.1"
                value={field.value ?? ''}
                onChange={e => {
                  const v = e.target.value;
                  field.onChange(v === '' ? undefined : parseFloat(v));
                }}
                placeholder="1.2"
                className="bg-surface3"
                disabled={readOnly}
              />
            </div>
          )}
        />

        <Controller
          name="memory.observationalMemory.reflection.bufferActivation"
          control={control}
          render={({ field }) => (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="memory-om-ref-buf-act" className="text-sm text-neutral5">
                {t('memory.bufferActivation')}
              </Label>
              <span className="text-xs text-neutral2">
                {t('memory.reflectorBufferActivationDesc')}
              </span>
              <Input
                id="memory-om-ref-buf-act"
                type="number"
                min="0"
                max="1"
                step="0.1"
                value={field.value ?? ''}
                onChange={e => {
                  const v = e.target.value;
                  field.onChange(v === '' ? undefined : parseFloat(v));
                }}
                placeholder="0.8"
                className="bg-surface3"
                disabled={readOnly}
              />
            </div>
          )}
        />
      </div>
    </div>
  );
}
