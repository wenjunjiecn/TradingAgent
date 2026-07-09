/**
 * Skill Config API Hooks
 *
 * 封装技能配置相关 REST API 调用，基于 TanStack Query。
 * 所有端点对应后端 /api/research/skills/* 路由。
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { SkillConfig, CreateSkillConfigInput } from '@trading-agent/shared';

// ── 复用 tool-api.ts 的基础设施 ──────────────────────────────────────

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

// ── Skill Config Hooks ───────────────────────────────────────────────

export function useSkillConfigs() {
  return useQuery({
    queryKey: ['skill-configs'],
    queryFn: () => apiFetch<{ skills: SkillConfig[] }>('/skills'),
    staleTime: 60_000,
    placeholderData: previousData => previousData,
  });
}

export function useSkillConfig(id: string | null) {
  return useQuery({
    queryKey: ['skill-config', id],
    queryFn: () => apiFetch<{ skill: SkillConfig }>(`/skills/${id}`),
    enabled: !!id,
    staleTime: 60_000,
  });
}

export function useCreateSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateSkillConfigInput) =>
      apiFetch<{ skill: SkillConfig }>('/skills', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['skill-configs'] });
    },
  });
}

export function useUpdateSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<SkillConfig> }) =>
      apiFetch<{ skill: SkillConfig }>(`/skills/${id}`, {
        method: 'PUT',
        body: JSON.stringify(updates),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['skill-configs'] });
      qc.invalidateQueries({ queryKey: ['skill-config'] });
    },
  });
}

export function useDeleteSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch(`/skills/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['skill-configs'] });
    },
  });
}
