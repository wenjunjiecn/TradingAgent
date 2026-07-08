# 界面国际化（i18n）实施计划

> **日期**: 2026-07-08
> **状态**: Draft
> **目标**: 引入 `react-i18next` 作为标准 i18n 框架，将项目中所有硬编码中文字符串提取为翻译 key，支持中文（zh-CN）和英文（en）两种语言，并提供语言切换能力。

---

## 一、现状分析

### 1.1 当前语言分布

| 层面 | 语言 | 实现方式 | 文件数 |
|------|------|---------|--------|
| 自定义投研页面（前端） | 中文 | 硬编码字符串 | ~17 个 |
| Mastra Studio 框架页面 | 英文 | `@mastra/playground-ui` 内置 | 不可控 |
| Agent 模板 / 指令（后端） | 中文 | 硬编码在 `agent-templates.ts` 等 | ~5 个 |
| 加载页 `loading.html` | 英文 | 硬编码 HTML | 1 个 |
| 主进程状态消息 | 英文 | `updateLoadingStatus()` 硬编码 | 1 个 |

### 1.2 涉及中文硬编码的前端文件清单

| # | 文件路径 | 中文内容 |
|---|---------|---------|
| 1 | `lib/nav/nav-items.tsx` | 导航栏标题、菜单项名称 |
| 2 | `pages/dashboard/index.tsx` | 看板标题、自选股面板、统计卡片、快捷操作 |
| 3 | `pages/collaboration/index.tsx` | 协作模式标签/描述、执行进度步骤、按钮文案 |
| 4 | `pages/reports/index.tsx` | 报告列表标题、搜索占位符、空状态 |
| 5 | `pages/reports/[reportId].tsx` | 报告详情标题、信心度、综合结论、风险清单、跟踪条件 |
| 6 | `pages/teams/index.tsx` | 团队列表标题、PATTERN_LABELS、删除确认 |
| 7 | `pages/teams/edit.tsx` | 表单标签、验证消息、保存/取消按钮 |
| 8 | `pages/teams/execute.tsx` | PATTERN_LABELS、执行状态、结果展示 |
| 9 | `pages/teams/components/CollaborationConfigEditor.tsx` | PATTERNS 标签、输出格式标签 |
| 10 | `pages/teams/components/TeamMemberPicker.tsx` | ROLES 标签、SIDES 标签 |
| 11 | `pages/market-data/index.tsx` | 行情数据标题、指标标签、图表说明 |
| 12 | `pages/agents/index.tsx` | Agent 列表（部分中文） |
| 13 | `lib/studio-index-redirect.tsx` | 注释（不影响 UI） |
| 14 | `lib/research-api.ts` | 注释（不影响 UI） |
| 15 | `lib/team-api.ts` | 注释（不影响 UI） |
| 16 | `App.tsx` | 路由面包屑 `创建团队`、`编辑团队`、`执行任务` |

### 1.3 涉及中文硬编码的后端文件清单

| # | 文件路径 | 中文内容 |
|---|---------|---------|
| 1 | `agents/agent-templates.ts` | 模板名称、描述、完整 system prompt |
| 2 | `teams/team-templates.ts` | 团队模板名称、描述、指令 |
| 3 | `api/team-routes.ts` | API 错误消息 |
| 4 | `api/research-routes.ts` | API 错误消息 |
| 5 | `teams/team-execution-engine.ts` | 执行日志消息 |
| 6 | `workflows/collaboration-engine.ts` | 协作引擎消息 |

### 1.4 技术约束

- **框架页面不可控**: `@mastra/playground-ui` 是 fork 的 UI 库，其内部组件文案为英文。本期仅国际化自定义页面，框架页面保持英文。
- **Agent 指令不国际化**: Agent 模板的 `instructions`（system prompt）是给 LLM 的指令，不是给用户看的 UI 文案。保持中文不变（因为 LLM 用中文指令效果更好）。
- **API 返回的模板数据**: `agentTemplates` 的 `name`、`description` 是展示给用户的，但这些数据通过 API 返回，不走前端翻译。后端可返回多语言版本或保持原样。
- **Electron 主进程**: `loading.html` 和 `updateLoadingStatus` 的文案在主进程/HTML 中，需要单独处理。

---

## 二、技术选型

### 2.1 框架选择: `react-i18next` + `i18next`

**理由:**
- React 生态最成熟的 i18n 方案，GitHub 6k+ stars
- 支持命名空间（namespace）拆分翻译文件
- 支持 React Suspense 懒加载
- 支持 TypeScript 类型推断（`i18next` v23+）
- 与 Vite 兼容良好
- 社区文档丰富，团队上手成本低

### 2.2 备选方案对比

| 方案 | 优点 | 缺点 | 结论 |
|------|------|------|------|
| `react-i18next` | 生态最大、功能最全、TS 支持好 | 包体稍大（~40KB gzip） | **✅ 选定** |
| `react-intl` (FormatJS) | ICU MessageFormat 标准化 | API 较重、学习曲线高 | ❌ |
| `lingui` | 编译时优化、宏语法 | 社区较小、Vite 插件不够成熟 | ❌ |
| 自建简易方案 | 零依赖 | 无命名空间、无懒加载、不可维护 | ❌ |

### 2.3 依赖版本

```
i18next: ^25.2.1
react-i18next: ^15.5.3
i18next-browser-languagedetector: ^8.2.0
```

---

## 三、架构设计

### 3.1 翻译文件目录结构

```
apps/desktop/src/renderer/
├── i18n/
│   ├── config.ts                  # i18next 初始化配置
│   ├── types.ts                   # TypeScript 类型生成（可选）
│   └── locales/
│       ├── zh-CN/
│       │   ├── common.json        # 通用文案（按钮、状态、错误等）
│       │   ├── nav.json           # 导航栏
│       │   ├── dashboard.json     # 投研看板
│       │   ├── collaboration.json # 协同投研
│       │   ├── reports.json       # 投研报告
│       │   ├── teams.json         # Agent Team
│       │   ├── market.json        # 行情数据
│       │   └── settings.json      # 设置页
│       └── en/
│           ├── common.json
│           ├── nav.json
│           ├── dashboard.json
│           ├── collaboration.json
│           ├── reports.json
│           ├── teams.json
│           ├── market.json
│           └── settings.json
```

### 3.2 命名空间规划

| 命名空间 | 覆盖范围 | 对应页面/组件 |
|----------|---------|--------------|
| `common` | 通用按钮、状态、错误提示、空状态 | 全局共享 |
| `nav` | 侧边栏导航 | `nav-items.tsx` |
| `dashboard` | 投研看板 | `pages/dashboard/` |
| `collaboration` | 协同投研 | `pages/collaboration/` |
| `reports` | 投研报告列表+详情 | `pages/reports/` |
| `teams` | Agent Team 管理 | `pages/teams/` |
| `market` | 行情数据 | `pages/market-data/` |
| `settings` | 设置页 | `pages/settings/` |

### 3.3 翻译 Key 命名规范

采用 **点分隔层级命名**，格式: `scope.entity.property`

```json
{
  "dashboard": {
    "title": "投研看板",
    "subtitle": "个人 AI 投研 Multi-Agent 系统 · 投资研究概览",
    "watchlist": {
      "title": "自选股",
      "empty": "暂无自选股，添加一个开始跟踪",
      "placeholder": "添加股票代码，如 AAPL",
      "addButton": "添加"
    },
    "stats": {
      "totalReports": "报告总数",
      "coveredSymbols": "覆盖标的",
      "buySuggestions": "买入建议"
    }
  }
}
```

使用方式:
```tsx
const { t } = useTranslation('dashboard');
t('title')           // → "投研看板"
t('watchlist.empty') // → "暂无自选股，添加一个开始跟踪"
```

### 3.4 语言检测与持久化

```
用户首次打开 → 检测系统语言 (navigator.language)
    ├─ 以 zh 开头 → 使用 zh-CN
    └─ 其他 → 使用 en
用户手动切换 → 保存到 localStorage('i18nextLng')
下次打开 → 读取 localStorage，无则检测系统语言
```

### 3.5 语言切换 UI

在设置页 (`/settings`) 新增 "Language" 区域，提供中文/英文切换。切换后即时生效，无需刷新。

---

## 四、分阶段实施

### Phase 1: 基础设施搭建（i18n 框架接入）

**目标**: 安装依赖、创建配置、初始化 i18next、包裹 App，确保框架可用。

#### Task 1.1: 安装依赖

**Files:**
- Modify: `apps/desktop/package.json`

- [ ] **Step 1: 安装 i18next 相关依赖**

```bash
cd /Users/wenjunjie/Documents/antigravity/jolly-curie/apps/desktop
npm install i18next@^25.2.1 react-i18next@^15.5.3 i18next-browser-languagedetector@^8.2.0
```

- [ ] **Step 2: 验证安装**

```bash
cd /Users/wenjunjie/Documents/antigravity/jolly-curie/apps/desktop
npx tsc --noEmit -p tsconfig.vite.json 2>&1 | head -10
```

预期：无 error。

#### Task 1.2: 创建 i18n 配置和翻译文件骨架

**Files:**
- Create: `apps/desktop/src/renderer/i18n/config.ts`
- Create: `apps/desktop/src/renderer/i18n/locales/zh-CN/common.json`
- Create: `apps/desktop/src/renderer/i18n/locales/en/common.json`
- Create: `apps/desktop/src/renderer/i18n/locales/zh-CN/nav.json`
- Create: `apps/desktop/src/renderer/i18n/locales/en/nav.json`

- [ ] **Step 1: 创建 i18next 初始化配置**

```typescript
// apps/desktop/src/renderer/i18n/config.ts
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

// 静态导入所有翻译资源（桌面端无需懒加载，包体可控）
import zhCNCommon from './locales/zh-CN/common.json';
import enCommon from './locales/en/common.json';
import zhCNNav from './locales/zh-CN/nav.json';
import enNav from './locales/en/nav.json';
import zhCNDashboard from './locales/zh-CN/dashboard.json';
import enDashboard from './locales/en/dashboard.json';
import zhCNCollaboration from './locales/zh-CN/collaboration.json';
import enCollaboration from './locales/en/collaboration.json';
import zhCNReports from './locales/zh-CN/reports.json';
import enReports from './locales/en/reports.json';
import zhCNTeams from './locales/zh-CN/teams.json';
import enTeams from './locales/en/teams.json';
import zhCNMarket from './locales/zh-CN/market.json';
import enMarket from './locales/en/market.json';
import zhCNSettings from './locales/zh-CN/settings.json';
import enSettings from './locales/en/settings.json';

export const SUPPORTED_LANGUAGES = [
  { code: 'zh-CN', label: '中文', flag: '🇨🇳' },
  { code: 'en', label: 'English', flag: '🇺🇸' },
] as const;

export const DEFAULT_LANGUAGE = 'zh-CN';

export const resources = {
  'zh-CN': {
    common: zhCNCommon,
    nav: zhCNNav,
    dashboard: zhCNDashboard,
    collaboration: zhCNCollaboration,
    reports: zhCNReports,
    teams: zhCNTeams,
    market: zhCNMarket,
    settings: zhCNSettings,
  },
  en: {
    common: enCommon,
    nav: enNav,
    dashboard: enDashboard,
    collaboration: enCollaboration,
    reports: enReports,
    teams: enTeams,
    market: enMarket,
    settings: enSettings,
  },
} as const;

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: DEFAULT_LANGUAGE,
    supportedLngs: ['zh-CN', 'en'],
    ns: ['common', 'nav', 'dashboard', 'collaboration', 'reports', 'teams', 'market', 'settings'],
    defaultNS: 'common',
    interpolation: {
      escapeValue: false, // React already escapes by default
    },
    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: 'i18nextLng',
      caches: ['localStorage'],
    },
  });

export default i18n;
```

- [ ] **Step 2: 创建 `common.json` 翻译文件**

```json
// apps/desktop/src/renderer/i18n/locales/zh-CN/common.json
{
  "actions": {
    "save": "保存",
    "cancel": "取消",
    "delete": "删除",
    "close": "关闭",
    "back": "返回",
    "confirm": "确认",
    "edit": "编辑",
    "create": "创建",
    "search": "搜索",
    "refresh": "刷新",
    "export": "导出",
    "selectAll": "全选",
    "clear": "清空",
    "start": "启动",
    "stop": "停止"
  },
  "status": {
    "loading": "加载中...",
    "noData": "暂无数据",
    "error": "加载失败",
    "success": "操作成功",
    "failed": "操作失败"
  },
  "confidence": "信心度",
  "pattern": "协作模式",
  "members": "成员",
  "report": "报告"
}
```

```json
// apps/desktop/src/renderer/i18n/locales/en/common.json
{
  "actions": {
    "save": "Save",
    "cancel": "Cancel",
    "delete": "Delete",
    "close": "Close",
    "back": "Back",
    "confirm": "Confirm",
    "edit": "Edit",
    "create": "Create",
    "search": "Search",
    "refresh": "Refresh",
    "export": "Export",
    "selectAll": "Select All",
    "clear": "Clear",
    "start": "Start",
    "stop": "Stop"
  },
  "status": {
    "loading": "Loading...",
    "noData": "No data",
    "error": "Failed to load",
    "success": "Success",
    "failed": "Failed"
  },
  "confidence": "Confidence",
  "pattern": "Pattern",
  "members": "members",
  "report": "Report"
}
```

- [ ] **Step 3: 创建 `nav.json` 翻译文件**

```json
// apps/desktop/src/renderer/i18n/locales/zh-CN/nav.json
{
  "sections": {
    "research": "投研",
    "system": "系统"
  },
  "items": {
    "dashboard": "投研看板",
    "collaboration": "协同投研",
    "agentTeam": "Agent Team",
    "reports": "投研报告",
    "marketData": "行情数据",
    "agentConfig": "Agent配置",
    "workflows": "Workflows",
    "mcpServers": "MCP Servers",
    "tools": "Tools",
    "skills": "Skills",
    "settings": "Settings"
  }
}
```

```json
// apps/desktop/src/renderer/i18n/locales/en/nav.json
{
  "sections": {
    "research": "Research",
    "system": "System"
  },
  "items": {
    "dashboard": "Dashboard",
    "collaboration": "Collaboration",
    "agentTeam": "Agent Team",
    "reports": "Reports",
    "marketData": "Market Data",
    "agentConfig": "Agents",
    "workflows": "Workflows",
    "mcpServers": "MCP Servers",
    "tools": "Tools",
    "skills": "Skills",
    "settings": "Settings"
  }
}
```

- [ ] **Step 4: 创建其余命名空间的空骨架文件**

为 `dashboard.json`、`collaboration.json`、`reports.json`、`teams.json`、`market.json`、`settings.json` 创建 `zh-CN` 和 `en` 两个版本，初始内容为 `{}`，后续 Task 中填充。

#### Task 1.3: 在应用入口初始化 i18n

**Files:**
- Modify: `apps/desktop/src/renderer/main.tsx`

- [ ] **Step 1: 在 `main.tsx` 中导入 i18n 配置**

在 `startStudio` 函数中、`createRoot` 之前导入 i18n 配置，确保在 React 渲染前完成初始化:

```typescript
// apps/desktop/src/renderer/main.tsx
import { StrictMode } from 'react';

import '@mastra/playground-ui/style.css';
import '@/index.css';

import { createRoot } from 'react-dom/client';

import './i18n/config'; // ← 新增：初始化 i18next
import App from './App.tsx';
import './index.css';

export function startStudio() {
  if (import.meta.env.DEV && import.meta.env.VITE_REACT_GRAB === 'true') {
    void import('react-grab');
  }

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
```

- [ ] **Step 2: 验证编译**

```bash
cd /Users/wenjunjie/Documents/antigravity/jolly-curie/apps/desktop
npx tsc --noEmit -p tsconfig.vite.json 2>&1 | head -10
```

- [ ] **Step 3: 验证运行**

```bash
cd /Users/wenjunjie/Documents/antigravity/jolly-curie && npm run dev:desktop &
```

预期：应用正常启动，控制台无 i18n 相关报错。

- [ ] **Step 4: Commit**

```bash
cd /Users/wenjunjie/Documents/antigravity/jolly-curie
git add apps/desktop/src/renderer/i18n/ apps/desktop/src/renderer/main.tsx apps/desktop/package.json
git commit -m "feat(desktop): integrate react-i18next with zh-CN and en locale skeletons"
```

---

### Phase 2: 自定义页面国际化迁移

**目标**: 将所有自定义投研页面的硬编码中文替换为 `t()` 调用，填充翻译 JSON 文件。

#### Task 2.1: 导航栏国际化

**Files:**
- Modify: `apps/desktop/src/renderer/lib/nav/nav-items.tsx`
- Modify: `apps/desktop/src/renderer/i18n/locales/zh-CN/nav.json` (已在 Task 1.2 创建)
- Modify: `apps/desktop/src/renderer/i18n/locales/en/nav.json`

- [ ] **Step 1: 修改 `nav-items.tsx` 使用翻译 key**

`nav-items.tsx` 导出的是静态常量，不能使用 Hook。改为导出 translation key，在渲染侧边栏的组件中调用 `t()`。

修改 `NavItem` 接口，将 `name` 改为 `nameKey`（翻译 key），在渲染处用 `t(nameKey)` 获取显示文本:

```typescript
// apps/desktop/src/renderer/lib/nav/nav-items.tsx
export interface NavItem {
  nameKey: string; // i18n key, e.g. 'nav:items.dashboard'
  url: string;
  Icon: NavIcon;
  isOnMastraPlatform?: boolean;
  activePaths?: string[];
}

export interface NavSection {
  key: string;
  titleKey: string; // i18n key, e.g. 'nav:sections.research'
  href?: string;
  items: NavItem[];
}

export const mainNav: NavSection[] = [
  {
    key: 'research',
    titleKey: 'nav:sections.research',
    items: [
      { nameKey: 'nav:items.dashboard', url: '/dashboard', Icon: BarChart3, isOnMastraPlatform: false },
      { nameKey: 'nav:items.collaboration', url: '/collaboration', Icon: Users, isOnMastraPlatform: false, activePaths: ['/collaboration'] },
      { nameKey: 'nav:items.agentTeam', url: '/teams', Icon: UsersRound, isOnMastraPlatform: false, activePaths: ['/teams'] },
      { nameKey: 'nav:items.reports', url: '/reports', Icon: FileText, isOnMastraPlatform: false, activePaths: ['/reports'] },
      { nameKey: 'nav:items.marketData', url: '/market-data', Icon: LineChart, isOnMastraPlatform: false, activePaths: ['/market-data'] },
    ],
  },
  {
    key: 'system',
    titleKey: 'nav:sections.system',
    items: [
      { nameKey: 'nav:items.agentConfig', url: '/agents', Icon: AgentIcon, isOnMastraPlatform: true },
      { nameKey: 'nav:items.workflows', url: '/workflows', Icon: WorkflowIcon, isOnMastraPlatform: true },
      { nameKey: 'nav:items.mcpServers', url: '/mcps', Icon: McpServerIcon, isOnMastraPlatform: true },
      { nameKey: 'nav:items.tools', url: '/tools', Icon: ToolsIcon, isOnMastraPlatform: true },
      { nameKey: 'nav:items.skills', url: '/workspaces', Icon: WorkspacesIcon, isOnMastraPlatform: true },
    ],
  },
];

export const bottomNav: NavItem[] = [
  { nameKey: 'nav:items.settings', url: '/settings', Icon: SettingsIcon, isOnMastraPlatform: false },
];
```

- [ ] **Step 2: 找到渲染 NavItem name 的组件并替换为 `t()`**

搜索使用了 `navItem.name` 或 `section.title` 的组件，改为 `t(item.nameKey)` 和 `t(section.titleKey)`。

主要渲染位置在 `@mastra/playground-ui` 的 Layout 组件中，需要检查是否有自定义覆盖:

```bash
cd /Users/wenjunjie/Documents/antigravity/jolly-curie
grep -rn "\.name\b\|\.title\b" apps/desktop/src/renderer/components/layout/ --include="*.tsx" | head -20
grep -rn "mainNav\|bottomNav\|NavSection\|NavItem" apps/desktop/src/renderer/ --include="*.tsx" | grep -v "nav-items.tsx" | head -20
```

如果 Layout 组件在 `@mastra/playground-ui` 内部消费 `NavItem.name`，则需要通过 prop 传入已翻译的字符串，或在该处包一层 wrapper 组件做翻译。

> **注意**: 需要检查 `@mastra/playground-ui` 的 Layout / Sidebar 组件如何消费 `mainNav`。如果它直接读取 `.name` 属性，则需要把 `nameKey` 改回 `name`，但在传入前用 `t()` 翻译。可以创建一个 `useTranslatedNav()` Hook:

```typescript
// apps/desktop/src/renderer/lib/nav/use-translated-nav.ts
import { useTranslation } from 'react-i18next';
import { mainNav, bottomNav, type NavItem, type NavSection } from './nav-items';

export function useTranslatedNav(): { mainNav: NavSection[]; bottomNav: NavItem[] } {
  const { t } = useTranslation('nav');
  return {
    mainNav: mainNav.map(section => ({
      ...section,
      title: t(section.titleKey),
      items: section.items.map(item => ({ ...item, name: t(item.nameKey) })),
    })),
    bottomNav: bottomNav.map(item => ({ ...item, name: t(item.nameKey) })),
  };
}
```

- [ ] **Step 3: 验证编译 + 运行**

```bash
cd /Users/wenjunjie/Documents/antigravity/jolly-curie/apps/desktop && npx tsc --noEmit -p tsconfig.vite.json 2>&1 | head -20
```

启动应用，确认侧边栏中文正常显示，切换语言后侧边栏文案变化。

- [ ] **Step 4: Commit**

```bash
cd /Users/wenjunjie/Documents/antigravity/jolly-curie
git add apps/desktop/src/renderer/lib/nav/ apps/desktop/src/renderer/i18n/locales/
git commit -m "feat(desktop): internationalize navigation sidebar with i18n keys"
```

---

#### Task 2.2: 投研看板（Dashboard）国际化

**Files:**
- Modify: `apps/desktop/src/renderer/pages/dashboard/index.tsx`
- Modify: `apps/desktop/src/renderer/i18n/locales/zh-CN/dashboard.json`
- Modify: `apps/desktop/src/renderer/i18n/locales/en/dashboard.json`

- [ ] **Step 1: 填充 `dashboard.json` 翻译文件**

```json
// apps/desktop/src/renderer/i18n/locales/zh-CN/dashboard.json
{
  "title": "投研看板",
  "subtitle": "个人 AI 投研 Multi-Agent 系统 · 投资研究概览",
  "watchlist": {
    "title": "自选股",
    "marketLink": "行情",
    "empty": "暂无自选股，添加一个开始跟踪",
    "placeholder": "添加股票代码，如 AAPL",
    "addButton": "添加"
  },
  "stats": {
    "totalReports": "报告总数",
    "coveredSymbols": "覆盖标的",
    "buySuggestions": "买入建议",
    "topSymbols": "热门标的",
    "reports": "份"
  },
  "recentReports": {
    "title": "最近投研报告",
    "viewAll": "全部",
    "empty": "暂无报告，去发起一次协同投研",
    "startResearch": "开始投研"
  },
  "quickActions": {
    "startCollaboration": {
      "label": "发起协同投研",
      "description": "选择标的和 Agent 团队，一键启动多角色协作分析"
    },
    "manageTeam": {
      "label": "管理 Agent Team",
      "description": "创建和管理多 Agent 协作团队，配置协作模式"
    },
    "viewMarket": {
      "label": "查看行情数据",
      "description": "K 线图表、技术指标、基本面数据一屏总览"
    },
    "browseReports": {
      "label": "浏览投研报告",
      "description": "查看历史报告，追踪结论和跟踪条件"
    }
  }
}
```

```json
// apps/desktop/src/renderer/i18n/locales/en/dashboard.json
{
  "title": "Research Dashboard",
  "subtitle": "Personal AI Investment Research Multi-Agent System · Overview",
  "watchlist": {
    "title": "Watchlist",
    "marketLink": "Market",
    "empty": "No watchlist items yet. Add one to start tracking.",
    "placeholder": "Add ticker, e.g. AAPL",
    "addButton": "Add"
  },
  "stats": {
    "totalReports": "Total Reports",
    "coveredSymbols": "Symbols Covered",
    "buySuggestions": "Buy Signals",
    "topSymbols": "Top Symbols",
    "reports": "reports"
  },
  "recentReports": {
    "title": "Recent Reports",
    "viewAll": "All",
    "empty": "No reports yet. Start a collaboration to generate one.",
    "startResearch": "Start Research"
  },
  "quickActions": {
    "startCollaboration": {
      "label": "Start Collaboration",
      "description": "Select target and agent team to launch multi-role analysis"
    },
    "manageTeam": {
      "label": "Manage Agent Teams",
      "description": "Create and manage multi-agent teams, configure collaboration patterns"
    },
    "viewMarket": {
      "label": "View Market Data",
      "description": "K-line charts, technical indicators, and fundamentals at a glance"
    },
    "browseReports": {
      "label": "Browse Reports",
      "description": "View historical reports, track conclusions and conditions"
    }
  }
}
```

- [ ] **Step 2: 修改 `dashboard/index.tsx` 使用 `useTranslation`**

在组件顶部添加:
```typescript
import { useTranslation } from 'react-i18next';
// ...
const { t } = useTranslation('dashboard');
```

将所有硬编码中文替换为 `t('key')` 调用，例如:
- `'投研看板'` → `t('title')`
- `'自选股'` → `t('watchlist.title')`
- `'暂无自选股，添加一个开始跟踪'` → `t('watchlist.empty')`
- `'添加股票代码，如 AAPL'` → `t('watchlist.placeholder')`
- `'添加'` → `t('watchlist.addButton')`
- `'报告总数'` → `t('stats.totalReports')`
- 等等...

- [ ] **Step 3: 验证编译 + 运行**

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/src/renderer/pages/dashboard/ apps/desktop/src/renderer/i18n/locales/
git commit -m "feat(desktop): internationalize dashboard page with i18n"
```

---

#### Task 2.3: 协同投研（Collaboration）国际化

**Files:**
- Modify: `apps/desktop/src/renderer/pages/collaboration/index.tsx`
- Modify: `apps/desktop/src/renderer/i18n/locales/zh-CN/collaboration.json`
- Modify: `apps/desktop/src/renderer/i18n/locales/en/collaboration.json`

- [ ] **Step 1: 填充 `collaboration.json` 翻译文件**

```json
// zh-CN/collaboration.json
{
  "title": "协同投研",
  "subtitle": "配置 Agent 团队和协作模式，启动多角色投研分析",
  "quickSelect": {
    "title": "已有团队快速执行",
    "manageTeams": "管理团队"
  },
  "quickConfigHint": "以下为快速配置模式，如需更多配置选项请使用 Agent Team 管理",
  "symbol": {
    "label": "分析标的",
    "placeholder": "输入美股代码，如 AAPL, NVDA, TSLA"
  },
  "pattern": {
    "label": "协作模式",
    "council": {
      "label": "圆桌会议",
      "description": "N 个 Agent 并行分析同一标的，Supervisor 汇总各方观点"
    },
    "pipeline": {
      "label": "流水线",
      "description": "N 个 Agent 串行分析，上游输出传递给下游"
    },
    "debate": {
      "label": "辩论",
      "description": "多空两方对抗分析，Supervisor 裁决"
    },
    "hierarchical": {
      "label": "层级委派",
      "description": "Supervisor 动态拆解任务并委派子 Agent"
    },
    "parallelScan": {
      "label": "并行扫描",
      "description": "N 个 Agent 分别扫描不同标的，返回多份报告"
    }
  },
  "agents": {
    "title": "Agent 团队",
    "selected": "已选 {{count}} 个",
    "selectAll": "全选",
    "clear": "清空",
    "loading": "加载 Agent 列表...",
    "loadFailed": "Agent 列表加载失败: {{error}}"
  },
  "actions": {
    "start": "启动协同投研",
    "running": "投研分析中...",
    "success": "投研完成！正在跳转报告..."
  },
  "progress": {
    "title": "执行进度",
    "step1": { "label": "获取行情数据", "desc": "拉取 K 线并计算技术指标" },
    "step2": { "label": "执行协作分析", "desc": "多角色 Agent 协同分析" },
    "step3": { "label": "汇总产出报告", "desc": "Supervisor 综合研判" }
  },
  "error": "投研执行失败"
}
```

```json
// en/collaboration.json
{
  "title": "Collaboration",
  "subtitle": "Configure agent team and collaboration pattern to launch multi-role research",
  "quickSelect": {
    "title": "Quick Execute with Existing Teams",
    "manageTeams": "Manage Teams"
  },
  "quickConfigHint": "This is a quick configuration mode. Use Agent Team management for more options.",
  "symbol": {
    "label": "Target Symbol",
    "placeholder": "Enter US stock ticker, e.g. AAPL, NVDA, TSLA"
  },
  "pattern": {
    "label": "Collaboration Pattern",
    "council": {
      "label": "Council",
      "description": "N agents analyze the same target in parallel, Supervisor summarizes"
    },
    "pipeline": {
      "label": "Pipeline",
      "description": "N agents analyze serially, upstream output passed downstream"
    },
    "debate": {
      "label": "Debate",
      "description": "Bull vs Bear adversarial analysis, Supervisor adjudicates"
    },
    "hierarchical": {
      "label": "Hierarchical",
      "description": "Supervisor dynamically decomposes tasks and delegates to sub-agents"
    },
    "parallelScan": {
      "label": "Parallel Scan",
      "description": "N agents scan different targets, returns multiple reports"
    }
  },
  "agents": {
    "title": "Agent Team",
    "selected": "{{count}} selected",
    "selectAll": "Select All",
    "clear": "Clear",
    "loading": "Loading agent list...",
    "loadFailed": "Failed to load agents: {{error}}"
  },
  "actions": {
    "start": "Start Collaboration",
    "running": "Analyzing...",
    "success": "Research complete! Redirecting to report..."
  },
  "progress": {
    "title": "Execution Progress",
    "step1": { "label": "Fetch Market Data", "desc": "Pull K-lines and calculate indicators" },
    "step2": { "label": "Collaborative Analysis", "desc": "Multi-role agents analyzing" },
    "step3": { "label": "Generate Report", "desc": "Supervisor synthesizes findings" }
  },
  "error": "Research execution failed"
}
```

- [ ] **Step 2: 修改 `collaboration/index.tsx` 使用 `useTranslation`**

注意 `PATTERNS` 数组是模块级常量，不能使用 Hook。改为使用翻译 key 引用:

```typescript
// 将 PATTERNS 数组中的 label/description 改为 i18n key
const PATTERNS = [
  { value: 'council', labelKey: 'pattern.council.label', descKey: 'pattern.council.description', icon: Users },
  { value: 'pipeline', labelKey: 'pattern.pipeline.label', descKey: 'pattern.pipeline.description', icon: GitBranch },
  // ...
];

// 在组件中:
const { t } = useTranslation('collaboration');
// 渲染时:
{t(p.labelKey)} / {t(p.descKey)}
```

同样处理 `CollaborationProgress` 组件中的 `steps` 数组。

- [ ] **Step 3: 验证编译 + 运行**

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/src/renderer/pages/collaboration/ apps/desktop/src/renderer/i18n/locales/
git commit -m "feat(desktop): internationalize collaboration page with i18n"
```

---

#### Task 2.4: 投研报告（Reports）国际化

**Files:**
- Modify: `apps/desktop/src/renderer/pages/reports/index.tsx`
- Modify: `apps/desktop/src/renderer/pages/reports/[reportId].tsx`
- Modify: `apps/desktop/src/renderer/i18n/locales/zh-CN/reports.json`
- Modify: `apps/desktop/src/renderer/i18n/locales/en/reports.json`

- [ ] **Step 1: 填充 `reports.json` 翻译文件**

```json
// zh-CN/reports.json
{
  "list": {
    "title": "投研报告",
    "subtitle": "查看和管理 AI 投研团队产出的分析报告",
    "startResearch": "发起投研",
    "searchPlaceholder": "搜索报告标题、结论...",
    "symbolFilterPlaceholder": "按标的筛选",
    "viewDetail": "查看详情",
    "empty": "暂无报告",
    "startFirst": "发起第一次投研",
    "loadFailed": "加载报告失败"
  },
  "detail": {
    "backToList": "返回报告列表",
    "notFound": "报告未找到",
    "notFoundDesc": "该报告可能已被删除",
    "loadFailed": "加载报告失败",
    "conclusion": "综合结论",
    "opinions": "各角色分析",
    "risks": "风险清单",
    "tracking": "跟踪条件",
    "technicalSignal": "技术交易信号",
    "triggerCondition": "触发条件",
    "suggestedAction": "建议动作"
  }
}
```

```json
// en/reports.json
{
  "list": {
    "title": "Research Reports",
    "subtitle": "View and manage analysis reports from AI research teams",
    "startResearch": "Start Research",
    "searchPlaceholder": "Search report title, conclusion...",
    "symbolFilterPlaceholder": "Filter by symbol",
    "viewDetail": "View Details",
    "empty": "No reports",
    "startFirst": "Start your first research",
    "loadFailed": "Failed to load reports"
  },
  "detail": {
    "backToList": "Back to Reports",
    "notFound": "Report Not Found",
    "notFoundDesc": "This report may have been deleted",
    "loadFailed": "Failed to load report",
    "conclusion": "Overall Conclusion",
    "opinions": "Agent Opinions",
    "risks": "Risk Factors",
    "tracking": "Tracking Conditions",
    "technicalSignal": "Technical Signal",
    "triggerCondition": "Trigger condition",
    "suggestedAction": "Suggested action"
  }
}
```

- [ ] **Step 2: 修改 `reports/index.tsx` 和 `reports/[reportId].tsx`**

替换所有硬编码中文字符串为 `t()` 调用。`信心度` 使用 `common:confidence`。

- [ ] **Step 3: 验证编译 + 运行**

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/src/renderer/pages/reports/ apps/desktop/src/renderer/i18n/locales/
git commit -m "feat(desktop): internationalize reports list and detail pages"
```

---

#### Task 2.5: Agent Team 管理国际化

**Files:**
- Modify: `apps/desktop/src/renderer/pages/teams/index.tsx`
- Modify: `apps/desktop/src/renderer/pages/teams/edit.tsx`
- Modify: `apps/desktop/src/renderer/pages/teams/execute.tsx`
- Modify: `apps/desktop/src/renderer/pages/teams/components/CollaborationConfigEditor.tsx`
- Modify: `apps/desktop/src/renderer/pages/teams/components/TeamMemberPicker.tsx`
- Modify: `apps/desktop/src/renderer/App.tsx` (路由面包屑)
- Modify: `apps/desktop/src/renderer/i18n/locales/zh-CN/teams.json`
- Modify: `apps/desktop/src/renderer/i18n/locales/en/teams.json`

- [ ] **Step 1: 填充 `teams.json` 翻译文件**

```json
// zh-CN/teams.json
{
  "list": {
    "title": "Agent Team",
    "subtitle": "将多个 Agent 按协作模式组织为可复用的团队",
    "create": "创建团队",
    "fromTemplate": "从模板创建",
    "deleteConfirm": "确定删除团队「{{name}}」吗？",
    "empty": "暂无团队",
    "members": "{{count}} 成员"
  },
  "edit": {
    "title": "编辑团队",
    "createTitle": "创建团队",
    "name": "团队名称",
    "namePlaceholder": "输入团队名称",
    "nameRequired": "请输入团队名称",
    "description": "团队描述",
    "descriptionPlaceholder": "描述团队职责和特点",
    "members": "团队成员",
    "supervisor": "Supervisor Agent",
    "save": "保存",
    "cancel": "取消",
    "back": "返回",
    "saving": "保存中...",
    "saveFailed": "保存失败"
  },
  "execute": {
    "title": "执行任务",
    "task": "任务描述",
    "taskPlaceholder": "输入分析任务描述",
    "target": "分析标的",
    "targetPlaceholder": "如 AAPL",
    "targets": "多标的（逗号分隔）",
    "extraContext": "额外上下文",
    "start": "开始执行",
    "running": "执行中...",
    "success": "执行完成！",
    "failed": "执行失败",
    "clearMemory": "清除团队记忆",
    "result": "执行结果"
  },
  "patterns": {
    "council": "圆桌会议",
    "pipeline": "流水线",
    "debate": "辩论",
    "hierarchical": "层级委派",
    "parallelScan": "并行扫描"
  },
  "roles": {
    "leader": "领导者",
    "analyst": "分析者",
    "reviewer": "审查者",
    "executor": "执行者",
    "observer": "观察者"
  },
  "sides": {
    "bull": "看多",
    "bear": "看空",
    "neutral": "中立"
  },
  "outputFormats": {
    "research-report": "投研报告",
    "summary": "摘要",
    "custom": "自定义"
  },
  "config": {
    "pattern": "协作模式",
    "rounds": "轮数",
    "passThroughContext": "传递上下文",
    "teamInstructions": "团队指令",
    "sharedContext": "共享上下文",
    "outputFormat": "输出格式",
    "sharedMemory": "共享记忆",
    "defaultTarget": "默认标的",
    "customSchema": "自定义 Schema",
    "tags": "标签"
  },
  "breadcrumbs": {
    "create": "创建团队",
    "edit": "编辑团队",
    "execute": "执行任务"
  }
}
```

```json
// en/teams.json
{
  "list": {
    "title": "Agent Team",
    "subtitle": "Organize multiple agents into reusable teams by collaboration pattern",
    "create": "Create Team",
    "fromTemplate": "From Template",
    "deleteConfirm": "Are you sure you want to delete team \"{{name}}\"?",
    "empty": "No teams yet",
    "members": "{{count}} members"
  },
  "edit": {
    "title": "Edit Team",
    "createTitle": "Create Team",
    "name": "Team Name",
    "namePlaceholder": "Enter team name",
    "nameRequired": "Please enter a team name",
    "description": "Description",
    "descriptionPlaceholder": "Describe the team's role and characteristics",
    "members": "Team Members",
    "supervisor": "Supervisor Agent",
    "save": "Save",
    "cancel": "Cancel",
    "back": "Back",
    "saving": "Saving...",
    "saveFailed": "Save failed"
  },
  "execute": {
    "title": "Execute Task",
    "task": "Task Description",
    "taskPlaceholder": "Enter analysis task description",
    "target": "Target Symbol",
    "targetPlaceholder": "e.g. AAPL",
    "targets": "Multiple symbols (comma-separated)",
    "extraContext": "Extra Context",
    "start": "Start Execution",
    "running": "Executing...",
    "success": "Execution complete!",
    "failed": "Execution failed",
    "clearMemory": "Clear Team Memory",
    "result": "Result"
  },
  "patterns": {
    "council": "Council",
    "pipeline": "Pipeline",
    "debate": "Debate",
    "hierarchical": "Hierarchical",
    "parallelScan": "Parallel Scan"
  },
  "roles": {
    "leader": "Leader",
    "analyst": "Analyst",
    "reviewer": "Reviewer",
    "executor": "Executor",
    "observer": "Observer"
  },
  "sides": {
    "bull": "Bull",
    "bear": "Bear",
    "neutral": "Neutral"
  },
  "outputFormats": {
    "research-report": "Research Report",
    "summary": "Summary",
    "custom": "Custom"
  },
  "config": {
    "pattern": "Collaboration Pattern",
    "rounds": "Rounds",
    "passThroughContext": "Pass Through Context",
    "teamInstructions": "Team Instructions",
    "sharedContext": "Shared Context",
    "outputFormat": "Output Format",
    "sharedMemory": "Shared Memory",
    "defaultTarget": "Default Target",
    "customSchema": "Custom Schema",
    "tags": "Tags"
  },
  "breadcrumbs": {
    "create": "Create Team",
    "edit": "Edit Team",
    "execute": "Execute Task"
  }
}
```

- [ ] **Step 2: 修改 `teams/index.tsx`**

`PATTERN_LABELS` 改为在组件内用 `t()` 构建:

```typescript
// 替换静态 PATTERN_LABELS:
// const PATTERN_LABELS: Record<CollaborationPattern, string> = { ... }

// 在组件中:
const { t } = useTranslation('teams');
const getPatternLabel = (pattern: CollaborationPattern) => t(`patterns.${pattern}`);
```

- [ ] **Step 3: 修改 `teams/edit.tsx`**

替换表单标签、验证消息（`alert('请输入团队名称')` → `alert(t('edit.nameRequired'))`）。

- [ ] **Step 4: 修改 `teams/execute.tsx`**

同 Step 2 的方式处理 `PATTERN_LABELS`。

- [ ] **Step 5: 修改 `teams/components/CollaborationConfigEditor.tsx`**

`PATTERNS` 和 `OUTPUT_FORMATS` 数组改为使用翻译 key。

- [ ] **Step 6: 修改 `teams/components/TeamMemberPicker.tsx`**

`ROLES` 和 `SIDES` 数组改为使用翻译 key。

- [ ] **Step 7: 修改 `App.tsx` 路由面包屑**

```typescript
// 将:
{ path: '/teams/create', ..., handle: navHandleWithChildren('/teams', [{ id: 'create-team', label: '创建团队' }]) },
// 改为（label 改为 i18n key，渲染面包屑处翻译）:
{ path: '/teams/create', ..., handle: navHandleWithChildren('/teams', [{ id: 'create-team', label: 'teams:breadcrumbs.create' }]) },
```

> **注意**: 需要检查面包屑渲染组件是否支持 `namespace:key` 格式。如果不支持，需要修改渲染逻辑: 检测 `label` 是否包含 `:`，如果是则用 `i18n.t(label)` 翻译。

- [ ] **Step 8: 验证编译 + 运行**

- [ ] **Step 9: Commit**

```bash
git add apps/desktop/src/renderer/pages/teams/ apps/desktop/src/renderer/App.tsx apps/desktop/src/renderer/i18n/locales/
git commit -m "feat(desktop): internationalize Agent Team management pages"
```

---

#### Task 2.6: 行情数据（Market Data）国际化

**Files:**
- Modify: `apps/desktop/src/renderer/pages/market-data/index.tsx`
- Modify: `apps/desktop/src/renderer/i18n/locales/zh-CN/market.json`
- Modify: `apps/desktop/src/renderer/i18n/locales/en/market.json`

- [ ] **Step 1: 填充 `market.json` 翻译文件**

```json
// zh-CN/market.json
{
  "title": "行情数据",
  "subtitle": "K 线图表、技术指标、基本面数据",
  "searchPlaceholder": "输入股票代码查看行情",
  "latestPrice": "最新价",
  "dataPoints": "{{count}} 根日线",
  "indicators": {
    "title": "技术指标",
    "rsi": "RSI(14)",
    "rsiOverbought": "超买",
    "rsiOversold": "超卖",
    "rsiNeutral": "中性",
    "ma20": "MA20",
    "ma60": "MA60",
    "macd": "MACD",
    "macdSignal": "MACD Signal",
    "macdHistogram": "MACD 柱",
    "macdBullish": "正向",
    "macdBearish": "负向",
    "maCross": "MA 交叉",
    "goldenCross": "金叉",
    "deathCross": "死叉"
  },
  "fundamentals": {
    "title": "基本面"
  },
  "error": "行情数据加载失败"
}
```

```json
// en/market.json
{
  "title": "Market Data",
  "subtitle": "K-line charts, technical indicators, fundamentals",
  "searchPlaceholder": "Enter ticker to view market data",
  "latestPrice": "Latest Price",
  "dataPoints": "{{count}} bars",
  "indicators": {
    "title": "Technical Indicators",
    "rsi": "RSI(14)",
    "rsiOverbought": "Overbought",
    "rsiOversold": "Oversold",
    "rsiNeutral": "Neutral",
    "ma20": "MA20",
    "ma60": "MA60",
    "macd": "MACD",
    "macdSignal": "MACD Signal",
    "macdHistogram": "MACD Histogram",
    "macdBullish": "Bullish",
    "macdBearish": "Bearish",
    "maCross": "MA Cross",
    "goldenCross": "Golden Cross",
    "deathCross": "Death Cross"
  },
  "fundamentals": {
    "title": "Fundamentals"
  },
  "error": "Failed to load market data"
}
```

- [ ] **Step 2: 修改 `market-data/index.tsx` 使用 `useTranslation`**

- [ ] **Step 3: 验证编译 + 运行**

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/src/renderer/pages/market-data/ apps/desktop/src/renderer/i18n/locales/
git commit -m "feat(desktop): internationalize market data page"
```

---

#### Task 2.7: 设置页国际化

**Files:**
- Modify: `apps/desktop/src/renderer/pages/settings/index.tsx`
- Modify: `apps/desktop/src/renderer/i18n/locales/zh-CN/settings.json`
- Modify: `apps/desktop/src/renderer/i18n/locales/en/settings.json`

- [ ] **Step 1: 填充 `settings.json` 翻译文件**

```json
// zh-CN/settings.json
{
  "theme": {
    "title": "外观",
    "description": "自定义工作室的外观。",
    "mode": "主题模式",
    "dark": "深色",
    "light": "浅色",
    "system": "跟随系统"
  },
  "connection": {
    "title": "Mastra 连接",
    "description": "配置 Mastra 实例 URL、API 前缀和请求头。"
  },
  "providers": {
    "title": "模型提供商",
    "description": "管理 AI 模型提供商的 API 密钥和连接。"
  },
  "language": {
    "title": "语言",
    "description": "选择界面显示语言。",
    "label": "界面语言"
  }
}
```

```json
// en/settings.json
{
  "theme": {
    "title": "Theme",
    "description": "Customize the appearance of the studio.",
    "mode": "Theme mode",
    "dark": "Dark",
    "light": "Light",
    "system": "System"
  },
  "connection": {
    "title": "Mastra Connection",
    "description": "Configure the Mastra instance URL, API prefix, and request headers used by the studio."
  },
  "providers": {
    "title": "Model Providers",
    "description": "Manage API keys and connections for AI model providers."
  },
  "language": {
    "title": "Language",
    "description": "Choose the interface language.",
    "label": "Interface Language"
  }
}
```

- [ ] **Step 2: 修改 `settings/index.tsx`，替换硬编码英文并添加语言切换**

```typescript
import { useTranslation } from 'react-i18next';
import { SUPPORTED_LANGUAGES } from '@/i18n/config';

// 在组件中:
const { t, i18n } = useTranslation('settings');

// Theme options 使用翻译:
const THEME_OPTIONS = [
  { value: 'dark', label: t('theme.dark'), Icon: MoonIcon },
  { value: 'light', label: t('theme.light'), Icon: SunIcon },
  { value: 'system', label: t('theme.system'), Icon: MonitorIcon },
];

// 新增语言切换 SectionCard:
<SectionCard title={t('language.title')} description={t('language.description')}>
  <SettingsRow label={t('language.label')} htmlFor="language">
    <Select
      value={i18n.language}
      onValueChange={(lang) => i18n.changeLanguage(lang)}
    >
      <SelectTrigger id="language" className="w-full sm:w-48">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {SUPPORTED_LANGUAGES.map(lang => (
          <SelectItem key={lang.code} value={lang.code}>
            {lang.flag} {lang.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  </SettingsRow>
</SectionCard>
```

- [ ] **Step 3: 验证编译 + 运行**

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/src/renderer/pages/settings/ apps/desktop/src/renderer/i18n/locales/
git commit -m "feat(desktop): internationalize settings page and add language switcher"
```

---

### Phase 3: 加载页与主进程国际化

**目标**: 国际化 Electron 加载页 `loading.html` 和主进程状态消息。

#### Task 3.1: 加载页国际化

**Files:**
- Modify: `apps/desktop/loading.html`
- Modify: `apps/desktop/src/main/index.ts`

- [ ] **Step 1: 在 `loading.html` 中添加双语支持**

`loading.html` 是纯 HTML，不能使用 React/i18next。改为在 `loading.html` 中定义中英文字符串映射，通过 `navigator.language` 检测语言:

```html
<script>
  const isZh = navigator.language.startsWith('zh');
  const i18n = {
    'starting': isZh ? '正在启动...' : 'Starting...',
    'checking': isZh ? '检查服务...' : 'Checking server…',
    'startingAgent': isZh ? '启动 Agent 服务...' : 'Starting agent server…',
    'booting': isZh ? '启动中 ({{progress}}%)' : 'Booting ({{progress}}%)',
    'serverReady': isZh ? '服务就绪' : 'Server ready',
    'loadingApp': isZh ? '加载应用...' : 'Loading application…',
    'ready': isZh ? '就绪' : 'Ready',
    'launching': isZh ? '启动中...' : 'Launching…',
    'startingMastra': isZh ? '启动 Mastra API...' : 'Starting Mastra API…',
    'startingDev': isZh ? '启动开发服务器...' : 'Starting dev server…',
    'bundling': isZh ? '打包中...' : 'Bundling…',
    'startupFailed': isZh ? '启动失败' : 'Startup Failed',
    'restartHint': isZh
      ? '请重启应用。如果问题持续，请检查配置。'
      : 'Please restart the application. If the problem persists, check your configuration.',
  };

  // 更新初始状态:
  window.__tradingAgentLoading.update(5, i18n.starting, `localhost:${port}`);
</script>
```

- [ ] **Step 2: 修改主进程 `updateLoadingStatus` 调用**

主进程中的 `updateLoadingStatus` 调用保持英文 label（因为 loading.html 会自己翻译），或改为传递 key:

```typescript
// 方案 A: 传递 i18n key，loading.html 负责翻译
updateLoadingStatus(10, 'checking');

// 方案 B: 主进程检测系统语言后传递已翻译文本
// （更简单但不够灵活）
```

选择方案 A，修改 `loading.html` 的 `update` 方法接收 key 并翻译。

- [ ] **Step 3: 验证加载页**

```bash
cd /Users/wenjunjie/Documents/antigravity/jolly-curie && npm run dev:desktop
```

确认加载页显示与系统语言匹配的文案。

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/loading.html apps/desktop/src/main/index.ts
git commit -m "feat(desktop): internationalize loading screen with system language detection"
```

---

### Phase 4: 面包屑渲染适配 + 最终验证

**目标**: 确保路由面包屑支持 i18n key 渲染，全局验证无遗漏的硬编码中文。

#### Task 4.1: 面包屑 i18n 适配

**Files:**
- Modify: `apps/desktop/src/renderer/lib/route-header.ts` (或面包屑渲染组件)

- [ ] **Step 1: 找到面包屑渲染逻辑**

```bash
cd /Users/wenjunjie/Documents/antigravity/jolly-curie
grep -rn "crumb.*label\|\.label" apps/desktop/src/renderer/lib/nav/ apps/desktop/src/renderer/lib/route-header* --include="*.tsx" --include="*.ts" | head -20
```

- [ ] **Step 2: 在面包屑渲染处添加 i18n 翻译**

在渲染 `crumb.label` 的位置，检测是否为 i18n key（格式 `namespace:key`），如果是则用 `i18n.t(label)` 翻译:

```typescript
import i18n from '@/i18n/config';

function translateCrumbLabel(label: string): string {
  if (label.includes(':')) {
    return i18n.t(label);
  }
  return label;
}
```

- [ ] **Step 3: 验证面包屑显示**

启动应用，导航到 `/teams/create`，确认面包屑显示"创建团队"（中文）或"Create Team"（英文）。

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/src/renderer/lib/
git commit -m "feat(desktop): support i18n keys in route breadcrumb labels"
```

---

#### Task 4.2: 全局扫描遗漏

- [ ] **Step 1: 搜索前端 renderer 目录中残留的硬编码中文**

```bash
cd /Users/wenjunjie/Documents/antigravity/jolly-curie
grep -rn '[\x{4e00}-\x{9fff}]' apps/desktop/src/renderer/ --include="*.tsx" --include="*.ts" | grep -v '__tests__' | grep -v '.test.' | grep -v 'i18n/' | grep -v '// ' | grep -v '/* ' | head -40
```

> 排除注释、测试文件、i18n 目录。

- [ ] **Step 2: 修复发现的遗漏**

对每个发现的硬编码中文，提取为翻译 key 并替换。

- [ ] **Step 3: 验证英文模式完整可用**

```bash
# 在浏览器控制台执行:
i18n.changeLanguage('en')
```

检查所有自定义页面在英文模式下无中文残留。

- [ ] **Step 4: 验证中文模式完整可用**

```bash
i18n.changeLanguage('zh-CN')
```

检查所有自定义页面在中文模式下无英文残留（框架页面除外）。

---

## 五、文件变更清单

### 新增文件（20 个）

| # | 文件路径 |
|---|---------|
| 1 | `apps/desktop/src/renderer/i18n/config.ts` |
| 2 | `apps/desktop/src/renderer/i18n/locales/zh-CN/common.json` |
| 3 | `apps/desktop/src/renderer/i18n/locales/en/common.json` |
| 4 | `apps/desktop/src/renderer/i18n/locales/zh-CN/nav.json` |
| 5 | `apps/desktop/src/renderer/i18n/locales/en/nav.json` |
| 6 | `apps/desktop/src/renderer/i18n/locales/zh-CN/dashboard.json` |
| 7 | `apps/desktop/src/renderer/i18n/locales/en/dashboard.json` |
| 8 | `apps/desktop/src/renderer/i18n/locales/zh-CN/collaboration.json` |
| 9 | `apps/desktop/src/renderer/i18n/locales/en/collaboration.json` |
| 10 | `apps/desktop/src/renderer/i18n/locales/zh-CN/reports.json` |
| 11 | `apps/desktop/src/renderer/i18n/locales/en/reports.json` |
| 12 | `apps/desktop/src/renderer/i18n/locales/zh-CN/teams.json` |
| 13 | `apps/desktop/src/renderer/i18n/locales/en/teams.json` |
| 14 | `apps/desktop/src/renderer/i18n/locales/zh-CN/market.json` |
| 15 | `apps/desktop/src/renderer/i18n/locales/en/market.json` |
| 16 | `apps/desktop/src/renderer/i18n/locales/zh-CN/settings.json` |
| 17 | `apps/desktop/src/renderer/i18n/locales/en/settings.json` |
| 18 | `apps/desktop/src/renderer/lib/nav/use-translated-nav.ts` |

### 修改文件（~14 个）

| # | 文件路径 | 变更摘要 |
|---|---------|---------|
| 1 | `apps/desktop/package.json` | 添加 i18next 依赖 |
| 2 | `apps/desktop/src/renderer/main.tsx` | 导入 i18n 初始化 |
| 3 | `apps/desktop/src/renderer/lib/nav/nav-items.tsx` | name → nameKey, title → titleKey |
| 4 | `apps/desktop/src/renderer/pages/dashboard/index.tsx` | 使用 `useTranslation` |
| 5 | `apps/desktop/src/renderer/pages/collaboration/index.tsx` | 使用 `useTranslation` |
| 6 | `apps/desktop/src/renderer/pages/reports/index.tsx` | 使用 `useTranslation` |
| 7 | `apps/desktop/src/renderer/pages/reports/[reportId].tsx` | 使用 `useTranslation` |
| 8 | `apps/desktop/src/renderer/pages/teams/index.tsx` | 使用 `useTranslation` |
| 9 | `apps/desktop/src/renderer/pages/teams/edit.tsx` | 使用 `useTranslation` |
| 10 | `apps/desktop/src/renderer/pages/teams/execute.tsx` | 使用 `useTranslation` |
| 11 | `apps/desktop/src/renderer/pages/teams/components/CollaborationConfigEditor.tsx` | 使用 `useTranslation` |
| 12 | `apps/desktop/src/renderer/pages/teams/components/TeamMemberPicker.tsx` | 使用 `useTranslation` |
| 13 | `apps/desktop/src/renderer/pages/market-data/index.tsx` | 使用 `useTranslation` |
| 14 | `apps/desktop/src/renderer/pages/settings/index.tsx` | 使用 `useTranslation` + 语言切换器 |
| 15 | `apps/desktop/src/renderer/App.tsx` | 路由面包屑 label → i18n key |
| 16 | `apps/desktop/loading.html` | 双语支持 |
| 17 | `apps/desktop/src/main/index.ts` | 状态消息使用 i18n key |

---

## 六、不国际化范围说明

以下内容本期 **不纳入** 国际化范围:

| 范围 | 原因 |
|------|------|
| `@mastra/playground-ui` 框架组件 | 第三方 fork 库，改动量大且升级困难 |
| Agent 模板的 `instructions` (system prompt) | 给 LLM 的指令，非 UI 文案 |
| Agent 模板的 `name` / `description` | 通过 API 返回的数据，需后端多语言支持（未来可扩展） |
| 后端 API 错误消息 | 后端 `throw new Error('...')` 中的中文，前端已做通用错误展示 |
| 代码注释 | 不影响 UI |
| E2E 测试文件 | 测试用例中的中文断言 |

---

## 七、验收标准

### Phase 1 验收
- [ ] `i18next`、`react-i18next`、`i18next-browser-languagedetector` 已安装
- [ ] `i18n/config.ts` 存在并正确初始化
- [ ] 8 个命名空间的 `zh-CN` 和 `en` JSON 文件存在
- [ ] `main.tsx` 中导入了 `i18n/config`
- [ ] 应用正常启动，控制台无 i18n 报错

### Phase 2 验收
- [ ] 导航栏在中文/英文下正确显示
- [ ] 投研看板页面在中文/英文下正确显示
- [ ] 协同投研页面在中文/英文下正确显示
- [ ] 投研报告列表和详情页在中文/英文下正确显示
- [ ] Agent Team 管理页面在中文/英文下正确显示
- [ ] 行情数据页面在中文/英文下正确显示
- [ ] 设置页在中文/英文下正确显示
- [ ] 设置页有语言切换器，切换后即时生效
- [ ] 语言选择持久化到 localStorage

### Phase 3 验收
- [ ] 加载页根据系统语言显示中/英文
- [ ] 主进程状态消息在加载页正确翻译

### Phase 4 验收
- [ ] 路由面包屑在中文/英文下正确显示
- [ ] `grep` 扫描前端 renderer 目录无遗漏的硬编码中文（注释除外）
- [ ] `npx tsc --noEmit -p tsconfig.vite.json` 编译通过

---

## 八、风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| `@mastra/playground-ui` 的 Layout 组件直接读取 `NavItem.name` | 导航栏显示 i18n key 而非翻译文本 | 创建 `useTranslatedNav()` Hook，在传入前翻译 |
| 模块级常量（PATTERNS、ROLES 等）不能使用 Hook | 编译错误 | 改为存储 i18n key，在组件渲染时用 `t()` 翻译 |
| 翻译 key 拼写错误 | 显示 raw key | 使用 TypeScript 类型推断或 eslint-plugin-i18next 检查 |
| `loading.html` 无法使用 React i18n | 加载页文案不翻译 | 在 HTML 中实现简易双语映射 |
| 框架页面保持英文，自定义页面中文 | 语言不一致体验 | 本期接受，未来可 fork playground-ui 做全量国际化 |
| i18next 静态导入增加包体 | 包体增加 ~40KB | 桌面端可接受，无需代码分割 |

---

## 九、执行顺序总结

```
Phase 1 (基础设施)
  Task 1.1 (安装依赖) → Task 1.2 (配置+翻译骨架) → Task 1.3 (入口初始化)
        ↓
Phase 2 (页面迁移 — 可并行)
  Task 2.1 (导航栏) ──────────────────┐
  Task 2.2 (看板) ────────────────────┤
  Task 2.3 (协同投研) ────────────────┤
  Task 2.4 (报告) ────────────────────┼→ Task 2.7 (设置页+语言切换)
  Task 2.5 (Agent Team) ──────────────┤
  Task 2.6 (行情数据) ────────────────┘
        ↓
Phase 3 (加载页)
  Task 3.1 (loading.html 双语)
        ↓
Phase 4 (收尾)
  Task 4.1 (面包屑适配) → Task 4.2 (全局扫描遗漏)
```

> **备注**: Phase 2 的各 Task 之间无依赖，可并行执行。但建议先完成 Task 2.1（导航栏）确认模式可行后再并行其余。整个计划预计 1-2 天完成。
