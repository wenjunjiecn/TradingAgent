import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

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
import zhCNTools from './locales/zh-CN/tools.json';
import enTools from './locales/en/tools.json';
import zhCNSkills from './locales/zh-CN/skills.json';
import enSkills from './locales/en/skills.json';
import zhCNAgents from './locales/zh-CN/agents.json';
import enAgents from './locales/en/agents.json';

export const SUPPORTED_LANGUAGES = [
  { code: 'zh-CN', label: '中文', flag: '🇨🇳' },
  { code: 'en', label: 'English', flag: '🇺🇸' },
] as const;

export const DEFAULT_LANGUAGE = 'zh-CN';

const resources = {
  'zh-CN': {
    common: zhCNCommon,
    nav: zhCNNav,
    dashboard: zhCNDashboard,
    collaboration: zhCNCollaboration,
    reports: zhCNReports,
    teams: zhCNTeams,
    market: zhCNMarket,
    settings: zhCNSettings,
    tools: zhCNTools,
    skills: zhCNSkills,
    agents: zhCNAgents,
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
    tools: enTools,
    skills: enSkills,
    agents: enAgents,
  },
} as const;

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: DEFAULT_LANGUAGE,
    supportedLngs: ['zh-CN', 'en'],
    ns: ['common', 'nav', 'dashboard', 'collaboration', 'reports', 'teams', 'market', 'settings', 'tools', 'skills', 'agents'],
    defaultNS: 'common',
    interpolation: {
      escapeValue: false,
    },
    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: 'i18nextLng',
      caches: ['localStorage'],
    },
  });

export default i18n;
