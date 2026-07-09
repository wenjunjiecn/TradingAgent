import type { AgentEditorConfig } from '../../context/agent-edit-form-context';
import type { useSidebarDescriptions } from './use-sidebar-descriptions';

export interface AgentCmsSection {
  name: string;
  nameKey: string;
  pathSuffix: string;
  descriptionKey: keyof ReturnType<typeof useSidebarDescriptions>;
  required: boolean;
}

export const AGENT_CMS_SECTIONS: AgentCmsSection[] = [
  { name: 'Identity', nameKey: 'cms.sidebar.identity', pathSuffix: '', descriptionKey: 'identity', required: true },
  { name: 'Instructions', nameKey: 'cms.sidebar.instructions', pathSuffix: '/instruction-blocks', descriptionKey: 'instructions', required: true },
  { name: 'Tools', nameKey: 'cms.sidebar.tools', pathSuffix: '/tools', descriptionKey: 'tools', required: false },
  { name: 'Agents', nameKey: 'cms.sidebar.agents', pathSuffix: '/agents', descriptionKey: 'agents', required: false },
  { name: 'Scorers', nameKey: 'cms.sidebar.scorers', pathSuffix: '/scorers', descriptionKey: 'scorers', required: false },
  { name: 'Workflows', nameKey: 'cms.sidebar.workflows', pathSuffix: '/workflows', descriptionKey: 'workflows', required: false },
  { name: 'Skills', nameKey: 'cms.sidebar.skills', pathSuffix: '/skills', descriptionKey: 'skills', required: false },
  { name: 'Memory', nameKey: 'cms.sidebar.memory', pathSuffix: '/memory', descriptionKey: 'memory', required: false },
  { name: 'Variables', nameKey: 'cms.sidebar.variables', pathSuffix: '/variables', descriptionKey: 'variables', required: false },
];

/** Sections available when editing a code-defined agent (override mode) */
export function getCodeAgentOverrideSections(editorConfig?: AgentEditorConfig): AgentCmsSection[] {
  if (editorConfig === false) return [];

  const sections = AGENT_CMS_SECTIONS.filter(section => {
    if (section.name === 'Instructions') return editorConfig?.instructions !== false;
    if (section.name === 'Tools') return editorConfig?.tools !== false;
    return section.name === 'Variables';
  });

  return sections;
}
