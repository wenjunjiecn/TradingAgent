import { PageLayout } from '@mastra/playground-ui/components/PageLayout';
import { SectionCard } from '@mastra/playground-ui/components/SectionCard';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@mastra/playground-ui/components/Select';
import { SettingsRow } from '@mastra/playground-ui/components/SettingsRow';
import { useTheme } from '@mastra/playground-ui/components/ThemeProvider';
import type { Theme } from '@mastra/playground-ui/components/ThemeProvider';
import type { LucideIcon } from 'lucide-react';
import { MonitorIcon, MoonIcon, SunIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { StudioConfigForm } from '@/domains/configuration/components/studio-config-form';
import { useStudioConfig } from '@/domains/configuration/context/studio-config-state';
import { LLMProviderConfig } from '@/domains/llm/components/llm-provider-config';
import { SUPPORTED_LANGUAGES } from '@/i18n/config';

const THEME_KEYS: { value: Theme; key: string; Icon: LucideIcon }[] = [
  { value: 'dark', key: 'settings:theme.dark', Icon: MoonIcon },
  { value: 'light', key: 'settings:theme.light', Icon: SunIcon },
  { value: 'system', key: 'settings:theme.system', Icon: MonitorIcon },
];

const isTheme = (value: string): value is Theme => THEME_KEYS.some(option => option.value === value);

function ThemeOptionLabel({ option }: { option: (typeof THEME_KEYS)[number] }) {
  const { t } = useTranslation();
  const { Icon } = option;

  return (
    <span className="inline-flex min-w-0 max-w-full items-center gap-2">
      <Icon aria-hidden="true" className="h-4 w-4 shrink-0 opacity-70" />
      <span className="min-w-0 truncate">{t(option.key)}</span>
    </span>
  );
}

export const StudioSettingsPage = () => {
  const { t } = useTranslation('settings');
  const { i18n } = useTranslation();
  const { baseUrl, headers, apiPrefix } = useStudioConfig();
  const { theme, setTheme } = useTheme();

  return (
    <PageLayout width="narrow">
      <PageLayout.MainArea className="flex flex-col gap-5 mt-6">
        <SectionCard title={t('theme.title')} description={t('theme.description')}>
          <SettingsRow label={t('theme.mode')} htmlFor="theme">
            <Select
              value={theme}
              onValueChange={value => {
                if (isTheme(value)) setTheme(value);
              }}
            >
              <SelectTrigger id="theme" className="w-full sm:w-48">
                <SelectValue className="inline-flex min-w-0 max-w-full items-center" />
              </SelectTrigger>
              <SelectContent>
                {THEME_KEYS.map(option => (
                  <SelectItem key={option.value} value={option.value}>
                    <ThemeOptionLabel option={option} />
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </SettingsRow>
        </SectionCard>

        <SectionCard title={t('language.title')} description={t('language.description')}>
          <SettingsRow label={t('language.label')} htmlFor="language">
            <Select
              value={i18n.language}
              onValueChange={value => {
                i18n.changeLanguage(value);
              }}
            >
              <SelectTrigger id="language" className="w-full sm:w-48">
                <SelectValue className="inline-flex min-w-0 max-w-full items-center" />
              </SelectTrigger>
              <SelectContent>
                {SUPPORTED_LANGUAGES.map(lang => (
                  <SelectItem key={lang.code} value={lang.code}>
                    <span className="inline-flex items-center gap-2">
                      <span>{lang.flag}</span>
                      <span>{lang.label}</span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </SettingsRow>
        </SectionCard>

        <SectionCard
          title={t('connection.title')}
          description={t('connection.description')}
        >
          <StudioConfigForm initialConfig={{ baseUrl, headers, apiPrefix }} />
        </SectionCard>

        <SectionCard
          title={t('providers.title')}
          description={t('providers.description')}
        >
          <LLMProviderConfig />
        </SectionCard>
      </PageLayout.MainArea>
    </PageLayout>
  );
};
