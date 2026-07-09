import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@mastra/playground-ui/components/Collapsible';
import { Input } from '@mastra/playground-ui/components/Input';
import { Label } from '@mastra/playground-ui/components/Label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@mastra/playground-ui/components/Select';
import { Switch } from '@mastra/playground-ui/components/Switch';
import { MemoryIcon } from '@mastra/playground-ui/icons/MemoryIcon';
import { ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { Controller, useWatch } from 'react-hook-form';
import type { UseFormSetValue, Control } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import type { AgentFormValues } from '../utils/form-validation';
import { SectionTitle } from '@/domains/cms/components/section/section-title';
import { useEmbedders } from '@/domains/embedders/hooks/use-embedders';
import { LLMProviders, LLMModels } from '@/domains/llm';
import { useVectors } from '@/domains/vectors/hooks/use-vectors';

interface MemorySectionProps {
  control: Control<AgentFormValues>;
  setValue: UseFormSetValue<AgentFormValues>;
  readOnly?: boolean;
}

export function MemorySection({ control, setValue, readOnly = false }: MemorySectionProps) {
  const { t } = useTranslation('agents');
  const [isOpen, setIsOpen] = useState(false);
  const [isObserverOpen, setIsObserverOpen] = useState(false);
  const [isReflectorOpen, setIsReflectorOpen] = useState(false);
  const memoryConfig = useWatch({ control, name: 'memory' });
  const isEnabled = memoryConfig?.enabled ?? false;
  const semanticRecallEnabled = memoryConfig?.semanticRecall ?? false;
  const observationalMemoryEnabled = memoryConfig?.observationalMemory?.enabled ?? false;
  const omProvider = useWatch({ control, name: 'memory.observationalMemory.model.provider' }) ?? '';
  const observerProvider = useWatch({ control, name: 'memory.observationalMemory.observation.model.provider' }) ?? '';
  const reflectorProvider = useWatch({ control, name: 'memory.observationalMemory.reflection.model.provider' }) ?? '';

  const { data: vectorsData } = useVectors();
  const { data: embeddersData } = useEmbedders();
  const vectors = vectorsData?.vectors ?? [];
  const embedders = embeddersData?.embedders ?? [];

  return (
    <div className="rounded-md border border-border1 bg-surface2">
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger className="flex items-center gap-1 w-full p-3 bg-surface3">
          <ChevronRight className="h-4 w-4 text-neutral3" />
          <SectionTitle icon={<MemoryIcon className="text-neutral3" />}>
            {t('memory.title')}{isEnabled && <span className="text-accent1 font-normal">{t('memory.enabledSuffix')}</span>}
          </SectionTitle>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="p-3 border-t border-border1 flex flex-col gap-4">
            <Controller
              name="memory.enabled"
              control={control}
              render={({ field }) => (
                <div className="flex items-center justify-between">
                  <div className="flex flex-col gap-0.5">
                    <Label htmlFor="memory-enabled" className="text-sm text-neutral5">
                      {t('memory.enableMemory')}
                    </Label>
                    <span className="text-xs text-neutral3">{t('memory.enableMemoryDesc')}</span>
                  </div>
                  <Switch
                    id="memory-enabled"
                    checked={field.value ?? false}
                    onCheckedChange={field.onChange}
                    disabled={readOnly}
                  />
                </div>
              )}
            />

            {isEnabled && (
              <>
                <Controller
                  name="memory.lastMessages"
                  control={control}
                  render={({ field }) => (
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="memory-last-messages" className="text-xs text-neutral4">
                        {t('memory.lastMessages')}
                      </Label>
                      <span className="text-xs text-neutral3">{t('memory.lastMessagesDesc')}</span>
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
                    </div>
                  )}
                />

                <Controller
                  name="memory.semanticRecall"
                  control={control}
                  render={({ field }) => (
                    <div className="flex items-center justify-between">
                      <div className="flex flex-col gap-0.5">
                        <Label htmlFor="memory-semantic-recall" className="text-sm text-neutral5">
                          {t('memory.semanticRecall')}
                        </Label>
                        <span className="text-xs text-neutral3">{t('memory.semanticRecallDesc')}</span>
                      </div>
                      <Switch
                        id="memory-semantic-recall"
                        checked={field.value ?? false}
                        onCheckedChange={field.onChange}
                        disabled={readOnly}
                      />
                    </div>
                  )}
                />

                {semanticRecallEnabled && (
                  <>
                    <Controller
                      name="memory.vector"
                      control={control}
                      render={({ field }) => (
                        <div className="flex flex-col gap-1.5">
                          <Label htmlFor="memory-vector" className="text-xs text-neutral4">
                            {t('memory.vectorStore')}
                          </Label>
                          <span className="text-xs text-neutral3">{t('memory.vectorStoreDesc')}</span>
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
                          <Label htmlFor="memory-embedder" className="text-xs text-neutral4">
                            {t('memory.embedderModel')}
                          </Label>
                          <span className="text-xs text-neutral3">{t('memory.embedderModelDesc')}</span>
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
                  </>
                )}

                <Controller
                  name="memory.readOnly"
                  control={control}
                  render={({ field }) => (
                    <div className="flex items-center justify-between">
                      <div className="flex flex-col gap-0.5">
                        <Label htmlFor="memory-read-only" className="text-sm text-neutral5">
                          {t('memory.readOnly')}
                        </Label>
                        <span className="text-xs text-neutral3">{t('memory.readOnlyDesc')}</span>
                      </div>
                      <Switch
                        id="memory-read-only"
                        checked={field.value ?? false}
                        onCheckedChange={field.onChange}
                        disabled={readOnly}
                      />
                    </div>
                  )}
                />

                <Controller
                  name="memory.observationalMemory.enabled"
                  control={control}
                  render={({ field }) => (
                    <div className="flex items-center justify-between">
                      <div className="flex flex-col gap-0.5">
                        <Label htmlFor="memory-observational" className="text-sm text-neutral5">
                          {t('memory.observationalMemory')}
                        </Label>
                        <span className="text-xs text-neutral3">
                          {t('memory.observationalMemoryDesc')}
                        </span>
                      </div>
                      <Switch
                        id="memory-observational"
                        checked={field.value ?? false}
                        onCheckedChange={field.onChange}
                        disabled={readOnly}
                      />
                    </div>
                  )}
                />

                {observationalMemoryEnabled && (
                  <div className="ml-2 pl-3 border-l-2 border-border1 flex flex-col gap-4">
                    <div className="flex flex-col gap-1.5">
                      <Label className="text-xs text-neutral4">{t('memory.provider')}</Label>
                      <span className="text-xs text-neutral3">{t('memory.providerDesc')}</span>
                      <Controller
                        name="memory.observationalMemory.model.provider"
                        control={control}
                        render={({ field }) => (
                          <div className={readOnly ? 'pointer-events-none opacity-60' : ''}>
                            <LLMProviders
                              value={field.value ?? ''}
                              onValueChange={v => {
                                field.onChange(v);
                                setValue('memory.observationalMemory.model.name', '');
                              }}
                            />
                          </div>
                        )}
                      />
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <Label className="text-xs text-neutral4">{t('memory.model')}</Label>
                      <span className="text-xs text-neutral3">{t('memory.modelDesc')}</span>
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
                          <Label htmlFor="memory-om-scope" className="text-xs text-neutral4">
                            {t('memory.scope')}
                          </Label>
                          <span className="text-xs text-neutral3">
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
                        <div className="flex items-center justify-between">
                          <div className="flex flex-col gap-0.5">
                            <Label htmlFor="memory-om-share-budget" className="text-sm text-neutral5">
                              {t('memory.shareTokenBudget')}
                            </Label>
                            <span className="text-xs text-neutral3">
                              {t('memory.shareTokenBudgetDesc')}
                            </span>
                          </div>
                          <Switch
                            id="memory-om-share-budget"
                            checked={field.value ?? false}
                            onCheckedChange={field.onChange}
                            disabled={readOnly}
                          />
                        </div>
                      )}
                    />

                    {/* Observer Configuration */}
                    <Collapsible open={isObserverOpen} onOpenChange={setIsObserverOpen}>
                      <CollapsibleTrigger className="flex items-center gap-1 w-full">
                        <ChevronRight
                          className={`h-3 w-3 text-neutral3 transition-transform ${isObserverOpen ? 'rotate-90' : ''}`}
                        />
                        <Label className="text-sm text-neutral5 cursor-pointer">{t('memory.observer')}</Label>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <div className="ml-2 pl-3 border-l-2 border-border1 mt-2 flex flex-col gap-4">
                          <div className="flex flex-col gap-1.5">
                            <Label className="text-xs text-neutral4">{t('memory.providerOverride')}</Label>
                            <span className="text-xs text-neutral3">
                              {t('memory.observerProviderOverrideDesc')}
                            </span>
                            <Controller
                              name="memory.observationalMemory.observation.model.provider"
                              control={control}
                              render={({ field }) => (
                                <div className={readOnly ? 'pointer-events-none opacity-60' : ''}>
                                  <LLMProviders
                                    value={field.value ?? ''}
                                    onValueChange={v => {
                                      field.onChange(v);
                                      setValue('memory.observationalMemory.observation.model.name', '');
                                    }}
                                  />
                                </div>
                              )}
                            />
                          </div>

                          <div className="flex flex-col gap-1.5">
                            <Label className="text-xs text-neutral4">{t('memory.modelOverride')}</Label>
                            <span className="text-xs text-neutral3">{t('memory.observerModelOverrideDesc')}</span>
                            <Controller
                              name="memory.observationalMemory.observation.model.name"
                              control={control}
                              render={({ field }) => (
                                <div className={readOnly ? 'pointer-events-none opacity-60' : ''}>
                                  <LLMModels
                                    value={field.value ?? ''}
                                    onValueChange={field.onChange}
                                    llmId={observerProvider}
                                  />
                                </div>
                              )}
                            />
                          </div>

                          <Controller
                            name="memory.observationalMemory.observation.messageTokens"
                            control={control}
                            render={({ field }) => (
                              <div className="flex flex-col gap-1.5">
                                <Label htmlFor="memory-om-obs-msg-tokens" className="text-xs text-neutral4">
                                  {t('memory.messageTokens')}
                                </Label>
                                <span className="text-xs text-neutral3">
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
                                <Label htmlFor="memory-om-obs-batch" className="text-xs text-neutral4">
                                  {t('memory.maxTokensPerBatch')}
                                </Label>
                                <span className="text-xs text-neutral3">
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
                                <Label htmlFor="memory-om-obs-buffer" className="text-xs text-neutral4">
                                  {t('memory.bufferTokens')}
                                </Label>
                                <span className="text-xs text-neutral3">
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
                                <Label htmlFor="memory-om-obs-buf-act" className="text-xs text-neutral4">
                                  {t('memory.bufferActivation')}
                                </Label>
                                <span className="text-xs text-neutral3">
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
                                <Label htmlFor="memory-om-obs-block" className="text-xs text-neutral4">
                                  {t('memory.blockAfter')}
                                </Label>
                                <span className="text-xs text-neutral3">
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
                      </CollapsibleContent>
                    </Collapsible>

                    {/* Reflector Configuration */}
                    <Collapsible open={isReflectorOpen} onOpenChange={setIsReflectorOpen}>
                      <CollapsibleTrigger className="flex items-center gap-1 w-full">
                        <ChevronRight
                          className={`h-3 w-3 text-neutral3 transition-transform ${isReflectorOpen ? 'rotate-90' : ''}`}
                        />
                        <Label className="text-sm text-neutral5 cursor-pointer">{t('memory.reflector')}</Label>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <div className="ml-2 pl-3 border-l-2 border-border1 mt-2 flex flex-col gap-4">
                          <div className="flex flex-col gap-1.5">
                            <Label className="text-xs text-neutral4">{t('memory.providerOverride')}</Label>
                            <span className="text-xs text-neutral3">
                              {t('memory.reflectorProviderOverrideDesc')}
                            </span>
                            <Controller
                              name="memory.observationalMemory.reflection.model.provider"
                              control={control}
                              render={({ field }) => (
                                <div className={readOnly ? 'pointer-events-none opacity-60' : ''}>
                                  <LLMProviders
                                    value={field.value ?? ''}
                                    onValueChange={v => {
                                      field.onChange(v);
                                      setValue('memory.observationalMemory.reflection.model.name', '');
                                    }}
                                  />
                                </div>
                              )}
                            />
                          </div>

                          <div className="flex flex-col gap-1.5">
                            <Label className="text-xs text-neutral4">{t('memory.modelOverride')}</Label>
                            <span className="text-xs text-neutral3">{t('memory.reflectorModelOverrideDesc')}</span>
                            <Controller
                              name="memory.observationalMemory.reflection.model.name"
                              control={control}
                              render={({ field }) => (
                                <div className={readOnly ? 'pointer-events-none opacity-60' : ''}>
                                  <LLMModels
                                    value={field.value ?? ''}
                                    onValueChange={field.onChange}
                                    llmId={reflectorProvider}
                                  />
                                </div>
                              )}
                            />
                          </div>

                          <Controller
                            name="memory.observationalMemory.reflection.observationTokens"
                            control={control}
                            render={({ field }) => (
                              <div className="flex flex-col gap-1.5">
                                <Label htmlFor="memory-om-ref-obs-tokens" className="text-xs text-neutral4">
                                  {t('memory.observationTokens')}
                                </Label>
                                <span className="text-xs text-neutral3">
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
                                <Label htmlFor="memory-om-ref-block" className="text-xs text-neutral4">
                                  {t('memory.blockAfter')}
                                </Label>
                                <span className="text-xs text-neutral3">
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
                                <Label htmlFor="memory-om-ref-buf-act" className="text-xs text-neutral4">
                                  {t('memory.bufferActivation')}
                                </Label>
                                <span className="text-xs text-neutral3">
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
                      </CollapsibleContent>
                    </Collapsible>
                  </div>
                )}
              </>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
