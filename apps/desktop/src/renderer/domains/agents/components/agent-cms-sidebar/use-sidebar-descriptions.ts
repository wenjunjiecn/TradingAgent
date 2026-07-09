import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useWatch } from 'react-hook-form';
import type { Control } from 'react-hook-form';

import type { AgentFormValues } from '../agent-edit-page/utils/form-validation';

export function useSidebarDescriptions(control: Control<AgentFormValues>) {
  const { t } = useTranslation('agents');
  const values = useWatch({ control });

  return useMemo(() => {
    const identity = !values.name || !values.model?.provider || !values.model?.name ? t('cms.sidebar.required') : values.name;

    const blockCount = (values.instructionBlocks ?? []).filter(
      b => b.type === 'prompt_block_ref' || (b.type === 'prompt_block' && b.content?.trim()),
    ).length;
    const instructions = blockCount === 0 ? t('cms.sidebar.required') : t('cms.sidebar.countBlock', { count: blockCount });

    const toolCount = Object.keys(values.tools ?? {}).length + Object.keys(values.integrationTools ?? {}).length;
    const tools = toolCount === 0 ? t('cms.sidebar.noneSelected') : t('cms.sidebar.countTool', { count: toolCount });

    const agentCount = Object.keys(values.agents ?? {}).length;
    const agents = agentCount === 0 ? t('cms.sidebar.noneSelected') : t('cms.sidebar.countAgent', { count: agentCount });

    const scorerCount = Object.keys(values.scorers ?? {}).length;
    const scorers = scorerCount === 0 ? t('cms.sidebar.noneSelected') : t('cms.sidebar.countScorer', { count: scorerCount });

    const workflowCount = Object.keys(values.workflows ?? {}).length;
    const workflows = workflowCount === 0 ? t('cms.sidebar.noneSelected') : t('cms.sidebar.countWorkflow', { count: workflowCount });

    const memory = values.memory?.enabled ? t('cms.sidebar.enabled') : t('cms.sidebar.disabled');

    const skillCount = Object.keys(values.skills ?? {}).length;
    const skills = skillCount === 0 ? t('cms.sidebar.noneSelected') : t('cms.sidebar.countSkill', { count: skillCount });

    const variableCount = Object.keys(values.variables?.properties ?? {}).length;
    const variables = variableCount === 0 ? t('cms.sidebar.noneDefined') : t('cms.sidebar.countVariable', { count: variableCount });

    return {
      identity: { description: identity, done: identity !== t('cms.sidebar.required') },
      instructions: { description: instructions, done: blockCount > 0 },
      tools: { description: tools, done: toolCount > 0 },
      agents: { description: agents, done: agentCount > 0 },
      scorers: { description: scorers, done: scorerCount > 0 },
      workflows: { description: workflows, done: workflowCount > 0 },
      skills: { description: skills, done: skillCount > 0 },
      memory: { description: memory, done: !!values.memory?.enabled },
      variables: { description: variables, done: variableCount > 0 },
    };
  }, [values, t]);
}
