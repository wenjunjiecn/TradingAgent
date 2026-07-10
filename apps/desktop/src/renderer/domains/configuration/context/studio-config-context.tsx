import { useEffect, useLayoutEffect, useMemo, useState } from 'react';

import { useMastraInstanceStatus } from '../hooks/use-mastra-instance-status';
import type { StudioConfig } from '../types';
import { StudioConfigContext } from './studio-config-state';

export interface StudioConfigProviderProps {
  children: React.ReactNode;
  endpoint?: string;
  defaultApiPrefix?: string;
  defaultHeaders?: Record<string, string>;
}

export const MASTRA_STUDIO_CONFIG_LOCAL_STORAGE_KEY = 'mastra-studio-config';
const AUTH_HEADER_PARAM = 'auth_header';
const AUTH_HEADER_NAME = 'Authorization';

const readUrlAuthHeader = (): Record<string, string> => {
  if (typeof window === 'undefined') return {};

  const authHeader = new URL(window.location.href).searchParams.get(AUTH_HEADER_PARAM);
  return authHeader ? { [AUTH_HEADER_NAME]: authHeader } : {};
};

const removeUrlAuthHeader = () => {
  if (typeof window === 'undefined') return;

  const url = new URL(window.location.href);
  if (!url.searchParams.has(AUTH_HEADER_PARAM)) return;

  url.searchParams.delete(AUTH_HEADER_PARAM);
  window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
};

const getPersistentConfig = (config: StudioConfig, { stripAuthorization = false }: { stripAuthorization?: boolean } = {}): StudioConfig => {
  const { [AUTH_HEADER_NAME]: _authorization, ...headers } = config.headers;
  if (!stripAuthorization && _authorization) {
    return { ...config, headers: { ...headers, [AUTH_HEADER_NAME]: _authorization } };
  }

  return { ...config, headers };
};

const readStoredConfig = () => {
  const storedConfig = localStorage.getItem(MASTRA_STUDIO_CONFIG_LOCAL_STORAGE_KEY);
  if (!storedConfig) return undefined;

  try {
    const parsedConfig = JSON.parse(storedConfig);
    if (typeof parsedConfig === 'object' && parsedConfig !== null) {
      return parsedConfig as Partial<StudioConfig>;
    }
  } catch {
    localStorage.removeItem(MASTRA_STUDIO_CONFIG_LOCAL_STORAGE_KEY);
  }

  return undefined;
};

const isRendererOriginConfig = (baseUrl: unknown, endpoint: string) => {
  if (typeof window === 'undefined' || typeof baseUrl !== 'string' || !baseUrl) return false;

  try {
    const storedOrigin = new URL(baseUrl).origin;
    const endpointOrigin = new URL(endpoint).origin;
    return storedOrigin === window.location.origin && storedOrigin !== endpointOrigin;
  } catch {
    return false;
  }
};

export const StudioConfigProvider = ({
  children,
  endpoint = 'http://localhost:4111',
  defaultApiPrefix = '/api',
  defaultHeaders,
}: StudioConfigProviderProps) => {
  const [urlHeaders] = useState<Record<string, string>>(readUrlAuthHeader);
  const hasUrlHeaders = Object.keys(urlHeaders).length > 0;
  const runtimeHeaders = useMemo(() => ({ ...(defaultHeaders ?? {}), ...urlHeaders }), [defaultHeaders, urlHeaders]);
  const { data: instanceStatus, isLoading: isStatusLoading, error } = useMastraInstanceStatus(endpoint, runtimeHeaders);
  const [config, setConfig] = useState<StudioConfig & { isLoading: boolean }>({
    baseUrl: '',
    headers: runtimeHeaders,
    apiPrefix: undefined,
    isLoading: true,
  });

  useEffect(() => {
    removeUrlAuthHeader();
  }, []);

  useLayoutEffect(() => {
    // Handle error case - stop loading but don't configure
    if (error && !isStatusLoading) {
      return setConfig({ baseUrl: '', headers: runtimeHeaders, apiPrefix: undefined, isLoading: false });
    }

    // Don't run the effect during the fetch request
    if (!instanceStatus?.status) return;

    const parsedConfig = readStoredConfig();
    if (parsedConfig) {
      if (isRendererOriginConfig(parsedConfig.baseUrl, endpoint)) {
        localStorage.removeItem(MASTRA_STUDIO_CONFIG_LOCAL_STORAGE_KEY);
      } else {
        // Use stored apiPrefix if set, otherwise fall back to CLI default for back-compat
        const normalizedConfig = {
          ...parsedConfig,
          headers: { ...runtimeHeaders, ...(parsedConfig.headers ?? {}), ...urlHeaders },
          apiPrefix: parsedConfig.apiPrefix ?? defaultApiPrefix,
        };
        if (hasUrlHeaders) {
          localStorage.setItem(
            MASTRA_STUDIO_CONFIG_LOCAL_STORAGE_KEY,
            JSON.stringify(getPersistentConfig(normalizedConfig, { stripAuthorization: true })),
          );
        }
        return setConfig({ ...normalizedConfig, isLoading: false });
      }
    }

    if (instanceStatus.status === 'active') {
      const nextConfig = { baseUrl: endpoint, headers: runtimeHeaders, apiPrefix: defaultApiPrefix };
      if (hasUrlHeaders) {
        localStorage.setItem(
          MASTRA_STUDIO_CONFIG_LOCAL_STORAGE_KEY,
          JSON.stringify(getPersistentConfig(nextConfig, { stripAuthorization: true })),
        );
      }
      return setConfig({ ...nextConfig, isLoading: false });
    }

    return setConfig({ baseUrl: '', headers: runtimeHeaders, apiPrefix: undefined, isLoading: false });
  }, [instanceStatus, endpoint, defaultApiPrefix, isStatusLoading, error, runtimeHeaders, urlHeaders, hasUrlHeaders]);

  const doSetConfig = (partialNewConfig: Partial<StudioConfig>) => {
    setConfig(prev => {
      const nextConfig = {
        ...prev,
        ...partialNewConfig,
        headers: {
          ...runtimeHeaders,
          ...(partialNewConfig.headers ?? prev.headers ?? {}),
        },
      };
      const persistentConfig = getPersistentConfig(nextConfig, { stripAuthorization: hasUrlHeaders });
      localStorage.setItem(MASTRA_STUDIO_CONFIG_LOCAL_STORAGE_KEY, JSON.stringify(persistentConfig));
      return nextConfig;
    });
  };

  return (
    <StudioConfigContext.Provider value={{ ...config, setConfig: doSetConfig }}>
      {children}
    </StudioConfigContext.Provider>
  );
};
