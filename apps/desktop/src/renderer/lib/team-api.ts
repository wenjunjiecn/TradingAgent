/**
 * Agent Team API Hooks
 *
 * 封装 Team 相关 REST API 调用，基于 TanStack Query。
 * 所有端点对应后端 /api/research/teams/* 路由。
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  AgentTeamConfig,
  AgentTeamTemplate,
  TeamExecutionInput,
  TeamExecutionResult,
} from '@trading-agent/shared';

// ── 复用 research-api.ts 的基础设施 ──────────────────────────────────

function getApiBase(): string {
  const protocol = window.MASTRA_SERVER_PROTOCOL || 'http';
  const host = window.MASTRA_SERVER_HOST || 'localhost';
  const port = window.MASTRA_SERVER_PORT || '4111';
  const prefix = window.MASTRA_API_PREFIX || '/api';
  return `${protocol}://${host}:${port}${prefix}`;
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

// ── Team Config Hooks ────────────────────────────────────────────────

export function useTeamConfigs() {
  return useQuery({
    queryKey: ['team-configs'],
    queryFn: () => apiFetch<{ teams: AgentTeamConfig[] }>('/teams'),
    staleTime: 60_000,
    placeholderData: previousData => previousData,
  });
}

export function useTeamConfig(id: string | null) {
  return useQuery({
    queryKey: ['team-config', id],
    queryFn: () => apiFetch<{ team: AgentTeamConfig }>(`/teams/${id}`),
    enabled: !!id,
    staleTime: 60_000,
  });
}

export function useCreateTeam() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (config: Omit<AgentTeamConfig, 'createdAt' | 'updatedAt' | 'isTemplate'>) =>
      apiFetch<{ team: AgentTeamConfig }>('/teams', {
        method: 'POST',
        body: JSON.stringify(config),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['team-configs'] });
    },
  });
}

export function useUpdateTeam() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<AgentTeamConfig> }) =>
      apiFetch<{ team: AgentTeamConfig }>(`/teams/${id}`, {
        method: 'PUT',
        body: JSON.stringify(updates),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['team-configs'] });
      qc.invalidateQueries({ queryKey: ['team-config'] });
    },
  });
}

export function useDeleteTeam() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch(`/teams/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['team-configs'] });
    },
  });
}

// ── Team Template Hooks ──────────────────────────────────────────────

export function useTeamTemplates() {
  return useQuery({
    queryKey: ['team-templates'],
    queryFn: () => apiFetch<{ templates: AgentTeamTemplate[] }>('/team-templates'),
    staleTime: 5 * 60_000,
  });
}

export function useCreateTeamFromTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ templateId, customName }: { templateId: string; customName?: string }) =>
      apiFetch<{ team: AgentTeamConfig }>('/teams/from-template', {
        method: 'POST',
        body: JSON.stringify({ templateId, customName }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['team-configs'] });
    },
  });
}

// ── Team Execution Hooks ─────────────────────────────────────────────

export function useExecuteTeam() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: { teamId: string } & Omit<TeamExecutionInput, 'teamId'>) => {
      const { teamId, ...rest } = params;
      return apiFetch<{ result: TeamExecutionResult }>(`/teams/${teamId}/execute`, {
        method: 'POST',
        body: JSON.stringify(rest),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['reports'] });
      qc.invalidateQueries({ queryKey: ['report-stats'] });
    },
  });
}

// ── Team Memory Hooks ────────────────────────────────────────────────

export function useClearTeamMemory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (teamId: string) => apiFetch(`/teams/${teamId}/memory`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['team-configs'] });
    },
  });
}
