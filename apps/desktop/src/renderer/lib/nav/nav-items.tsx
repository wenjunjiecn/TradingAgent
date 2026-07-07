import { AgentIcon } from '@mastra/playground-ui/icons/AgentIcon';
import { McpServerIcon } from '@mastra/playground-ui/icons/McpServerIcon';
import { SettingsIcon } from '@mastra/playground-ui/icons/SettingsIcon';
import { ToolsIcon } from '@mastra/playground-ui/icons/ToolsIcon';
import { WorkflowIcon } from '@mastra/playground-ui/icons/WorkflowIcon';
import { WorkspacesIcon } from '@mastra/playground-ui/icons/WorkspacesIcon';
import { BarChart3, FileText, Users, LineChart, UsersRound } from 'lucide-react';
import type { ComponentType, SVGProps } from 'react';

export type NavIcon = ComponentType<SVGProps<SVGSVGElement>>;

export interface NavItem {
  name: string;
  url: string;
  Icon: NavIcon;
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
  // ── 投研核心 ──────────────────────────────────────────────────────
  {
    key: 'research',
    title: '投研',
    items: [
      {
        name: '投研看板',
        url: '/dashboard',
        Icon: BarChart3,
        isOnMastraPlatform: false,
      },
      {
        name: '协同投研',
        url: '/collaboration',
        Icon: Users,
        isOnMastraPlatform: false,
        activePaths: ['/collaboration'],
      },
      {
        name: 'Agent Team',
        url: '/teams',
        Icon: UsersRound,
        isOnMastraPlatform: false,
        activePaths: ['/teams'],
      },
      {
        name: '投研报告',
        url: '/reports',
        Icon: FileText,
        isOnMastraPlatform: false,
        activePaths: ['/reports'],
      },
      {
        name: '行情数据',
        url: '/market-data',
        Icon: LineChart,
        isOnMastraPlatform: false,
        activePaths: ['/market-data'],
      },
    ],
  },
  // ── 系统配置 ──────────────────────────────────────────────────────
  {
    key: 'primitives',
    title: '系统',
    items: [
      {
        name: 'Agent配置',
        url: '/agents',
        Icon: AgentIcon,
        isOnMastraPlatform: true,
      },
      {
        name: 'Workflows',
        url: '/workflows',
        Icon: WorkflowIcon,
        isOnMastraPlatform: true,
      },
      {
        name: 'MCP Servers',
        url: '/mcps',
        Icon: McpServerIcon,
        isOnMastraPlatform: true,
      },
      {
        name: 'Tools',
        url: '/tools',
        Icon: ToolsIcon,
        isOnMastraPlatform: true,
      },
      {
        name: 'Skills',
        url: '/workspaces',
        Icon: WorkspacesIcon,
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
