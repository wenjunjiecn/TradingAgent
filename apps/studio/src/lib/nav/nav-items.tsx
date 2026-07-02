import { AgentIcon } from '@mastra/playground-ui/icons/AgentIcon';
import { McpServerIcon } from '@mastra/playground-ui/icons/McpServerIcon';
import { SettingsIcon } from '@mastra/playground-ui/icons/SettingsIcon';
import { ToolsIcon } from '@mastra/playground-ui/icons/ToolsIcon';
import { WorkflowIcon } from '@mastra/playground-ui/icons/WorkflowIcon';
import { WorkspacesIcon } from '@mastra/playground-ui/icons/WorkspacesIcon';
import type { ComponentType, SVGProps } from 'react';

export type NavIcon = ComponentType<SVGProps<SVGSVGElement>>;

export interface NavItem {
  name: string;
  url: string;
  Icon: NavIcon;
  docs?: { href: string; label?: string };
  isOnMastraPlatform?: boolean;
  activePaths?: string[];
}

export interface NavSection {
  key: string;
  title: string;
  href?: string;
  items: NavItem[];
}

export const mainNav: NavSection[] = [
  {
    key: 'primitives',
    title: 'Primitives',
    items: [
      {
        name: 'Agents',
        url: '/agents',
        Icon: AgentIcon,
        docs: { href: 'https://mastra.ai/en/docs/agents/overview', label: 'Agents documentation' },
        isOnMastraPlatform: true,
      },
      {
        name: 'Workflows',
        url: '/workflows',
        Icon: WorkflowIcon,
        docs: { href: 'https://mastra.ai/en/docs/workflows/overview', label: 'Workflows documentation' },
        isOnMastraPlatform: true,
      },
      {
        name: 'MCP Servers',
        url: '/mcps',
        Icon: McpServerIcon,
        docs: { href: 'https://mastra.ai/en/docs/tools-mcp/mcp-overview', label: 'MCP documentation' },
        isOnMastraPlatform: true,
      },
      {
        name: 'Tools',
        url: '/tools',
        Icon: ToolsIcon,
        docs: { href: 'https://mastra.ai/en/docs/agents/using-tools-and-mcp', label: 'Tools documentation' },
        isOnMastraPlatform: true,
      },
      {
        name: 'Skills',
        url: '/workspaces',
        Icon: WorkspacesIcon,
        docs: { href: 'https://mastra.ai/en/docs/workspace/skills', label: 'Skills documentation' },
        isOnMastraPlatform: true,
      },
    ],
  },
];

export const bottomNav: NavItem[] = [
  { name: 'Settings', url: '/settings', Icon: SettingsIcon, isOnMastraPlatform: false },
];

/** Section-level entries used to resolve breadcrumb label + icon for the overview routes. */
export const sectionNav: NavItem[] = [];

// sectionNav comes first so /evaluation resolves to "Evaluation" (section crumb) rather than the
// in-section "Overview" NavLink which shares the same url.
const allItems: NavItem[] = [...sectionNav, ...mainNav.flatMap(s => s.items), ...bottomNav];

export function findNavItem(url: string): NavItem | undefined {
  return allItems.find(i => i.url === url);
}
