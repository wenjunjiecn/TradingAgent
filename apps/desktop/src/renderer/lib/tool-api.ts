/**
 * Tool Config API Hooks
 *
 * 封装工具配置相关 REST API 调用，基于 TanStack Query。
 * 所有端点对应后端 /api/research/tools/* 路由。
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { ToolConfig, CreateToolConfigInput } from '@trading-agent/shared';

// ── 复用 team-api.ts 的基础设施 ──────────────────────────────────────

function getApiBase(): string {
  const protocol = window.MASTRA_SERVER_PROTOCOL || 'http';
  const host = window.MASTRA_SERVER_HOST || 'localhost';
  const port = window.MASTRA_SERVER_PORT || '4111';
  return `${protocol}://${host}:${port}`;
}

function getHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  const token = window.tradingAgent?.desktopAuthToken;
  if (token) {
    headers['x-trading-agent-token'] = token;
  }
  return headers;
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const base = getApiBase();
  const response = await fetch(`${base}/research${path}`, {
    ...init,
    headers: { ...getHeaders(), ...init?.headers },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(body.error || `HTTP ${response.status}`);
  }
  return response.json() as Promise<T>;
}

// ── Tool Config Hooks ────────────────────────────────────────────────

export function useToolConfigs() {
  return useQuery({
    queryKey: ['tool-configs'],
    queryFn: () => apiFetch<{ tools: ToolConfig[] }>('/tools'),
    staleTime: 60_000,
    placeholderData: previousData => previousData,
  });
}

export function useToolConfig(id: string | null) {
  return useQuery({
    queryKey: ['tool-config', id],
    queryFn: () => apiFetch<{ tool: ToolConfig }>(`/tools/${id}`),
    enabled: !!id,
    staleTime: 60_000,
  });
}

export function useCreateTool() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateToolConfigInput) =>
      apiFetch<{ tool: ToolConfig }>('/tools', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tool-configs'] });
    },
  });
}

export function useUpdateTool() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<ToolConfig> }) =>
      apiFetch<{ tool: ToolConfig }>(`/tools/${id}`, {
        method: 'PUT',
        body: JSON.stringify(updates),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tool-configs'] });
      qc.invalidateQueries({ queryKey: ['tool-config'] });
    },
  });
}

export function useDeleteTool() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch(`/tools/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tool-configs'] });
    },
  });
}

export function useTestTool() {
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Record<string, any> }) =>
      apiFetch<{ result: any }>(`/tools/${id}/test`, {
        method: 'POST',
        body: JSON.stringify({ input }),
      }),
  });
}
