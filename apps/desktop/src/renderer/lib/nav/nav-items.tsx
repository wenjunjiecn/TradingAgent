import { AgentIcon } from '@mastra/playground-ui/icons/AgentIcon';
import { SettingsIcon } from '@mastra/playground-ui/icons/SettingsIcon';
import { ToolsIcon } from '@mastra/playground-ui/icons/ToolsIcon';
import { WorkspacesIcon } from '@mastra/playground-ui/icons/WorkspacesIcon';
import { BarChart3, FileText, Users, LineChart, UsersRound } from 'lucide-react';
import type { ComponentType, SVGProps } from 'react';

export type NavIcon = ComponentType<SVGProps<SVGSVGElement>>;

export interface NavItem {
  /** i18n key for the display name, e.g. 'nav:items.dashboard' */
  name: string;
  url: string;
  Icon: NavIcon;
  isOnMastraPlatform?: boolean;
  activePaths?: string[];
}

export interface NavSection {
  key: string;
  /** i18n key for the section title, e.g. 'nav:sections.research' */
  title: string;
  href?: string;
  items: NavItem[];
}

export const mainNav: NavSection[] = [
  // ── 投研核心 ──────────────────────────────────────────────────────
  {
    key: 'research',
    title: 'nav:sections.research',
    items: [
      {
        name: 'nav:items.dashboard',
        url: '/dashboard',
        Icon: BarChart3,
        isOnMastraPlatform: false,
      },
      {
        name: 'nav:items.collaboration',
        url: '/collaboration',
        Icon: Users,
        isOnMastraPlatform: false,
        activePaths: ['/collaboration'],
      },
      {
        name: 'nav:items.agentTeam',
        url: '/teams',
        Icon: UsersRound,
        isOnMastraPlatform: false,
        activePaths: ['/teams'],
      },
      {
        name: 'nav:items.reports',
        url: '/reports',
        Icon: FileText,
        isOnMastraPlatform: false,
        activePaths: ['/reports'],
      },
      {
        name: 'nav:items.marketData',
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
    title: 'nav:sections.system',
    items: [
      {
        name: 'nav:items.agentConfig',
        url: '/agents',
        Icon: AgentIcon,
        isOnMastraPlatform: true,
      },
      {
        name: 'nav:items.tools',
        url: '/tools',
        Icon: ToolsIcon,
        isOnMastraPlatform: true,
      },
      {
        name: 'nav:items.skills',
        url: '/skills',
        Icon: WorkspacesIcon,
        isOnMastraPlatform: false,
      },
    ],
  },
];

export const bottomNav: NavItem[] = [
  { name: 'nav:items.settings', url: '/settings', Icon: SettingsIcon, isOnMastraPlatform: false },
];

/** Section-level entries used to resolve breadcrumb label + icon for the overview routes. */
export const sectionNav: NavItem[] = [];

// sectionNav comes first so /evaluation resolves to "Evaluation" (section crumb) rather than the
// in-section "Overview" NavLink which shares the same url.
const allItems: NavItem[] = [...sectionNav, ...mainNav.flatMap(s => s.items), ...bottomNav];

export function findNavItem(url: string): NavItem | undefined {
  return allItems.find(i => i.url === url);
}
