import type { Resolver } from 'react-hook-form';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import type { AgentFormValues } from './utils/form-validation';
import { createInstructionBlock } from './utils/form-validation';

// Simple validation resolver without zod to avoid version conflicts
function createAgentFormResolver({
  isCodeAgentOverride,
  t,
}: { isCodeAgentOverride?: boolean; t: (key: string) => string } = {}): Resolver<AgentFormValues> {
  return async values => {
    const errors: Record<string, { type: string; message: string }> = {};

    if (!isCodeAgentOverride) {
      if (!values.name || values.name.trim() === '') {
        errors.name = { type: 'required', message: t('validation.nameRequired') };
      } else if (values.name.length > 100) {
        errors.name = { type: 'maxLength', message: t('validation.nameMaxLength') };
      }

      if (values.description && values.description.length > 500) {
        errors.description = { type: 'maxLength', message: t('validation.descriptionMaxLength') };
      }
    }

    // Validate instructions: check blocks if present, otherwise check plain instructions string.
    // Skip for code-agent overrides — instructions may not be Studio-editable (e.g. descriptions-only
    // mode locks instructions), and the server only persists overridable fields anyway.
    if (!isCodeAgentOverride) {
      const blocks = values.instructionBlocks;
      const hasBlockContent =
        blocks &&
        blocks.some(
          b =>
            (b.type === 'prompt_block_ref' && b.promptBlockId?.trim() !== '') ||
            (b.type === 'prompt_block' && b.content.trim() !== ''),
        );
      const hasPlainInstructions = values.instructions && values.instructions.trim() !== '';

      if (!hasBlockContent && !hasPlainInstructions) {
        errors.instructions = { type: 'required', message: t('validation.instructionsRequired') };
      }
    }

    if (!isCodeAgentOverride) {
      if (!values.model?.provider || values.model.provider.trim() === '') {
        errors['model.provider'] = { type: 'required', message: t('validation.providerRequired') };
      }

      if (!values.model?.name || values.model.name.trim() === '') {
        errors['model.name'] = { type: 'required', message: t('validation.modelRequired') };
      }
    }

    return {
      values: Object.keys(errors).length === 0 ? values : {},
      errors: Object.keys(errors).length > 0 ? errors : {},
    };
  };
}

export interface UseAgentEditFormOptions {
  initialValues?: Partial<AgentFormValues>;
  isCodeAgentOverride?: boolean;
}

export function useAgentEditForm(options: UseAgentEditFormOptions = {}) {
  const { initialValues, isCodeAgentOverride } = options;
  const { t } = useTranslation('agents');

  const form = useForm<AgentFormValues>({
    resolver: createAgentFormResolver({ isCodeAgentOverride, t }),
    defaultValues: {
      name: initialValues?.name ?? '',
      description: initialValues?.description ?? '',
      instructions: initialValues?.instructions ?? '',
      model: initialValues?.model ?? { provider: '', name: '' },
      tools: initialValues?.tools ?? {},
      integrationTools: initialValues?.integrationTools ?? {},
      workflows: initialValues?.workflows ?? {},
      agents: initialValues?.agents ?? {},
      scorers: initialValues?.scorers ?? {},
      variables: initialValues?.variables ?? {},
      instructionBlocks: initialValues?.instructionBlocks ?? [createInstructionBlock()],
      mcpClients: initialValues?.mcpClients ?? [],
      mcpClientsToDelete: [],
      skills: initialValues?.skills ?? {},
    },
  });

  return { form };
}
