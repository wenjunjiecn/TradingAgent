/**
 * 投研 API Hooks
 *
 * 封装投研相关 REST API 调用，基于 TanStack Query。
 * 所有端点对应后端 /api/research/* 路由。
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

// ── API 基础配置 ──────────────────────────────────────────────────────

function getApiBase(): string {
  const protocol = window.MASTRA_SERVER_PROTOCOL || 'http';
  const host = window.MASTRA_SERVER_HOST || 'localhost';
  const port = window.MASTRA_SERVER_PORT || '4111';
  // 自定义 API 路由（/research/*）不带 /api 前缀，
  // 与 Mastra 内置 API（/api/agents 等）不同
  return `${protocol}://${host}:${port}`;
}

function getHeaders(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
  };
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

// ── 类型定义 ──────────────────────────────────────────────────────────

import type {
  ResearchReport,
  AgentConfig,
  AgentTemplate,
  ResearchWorkflowConfig,
  Indicators,
  KLineData,
} from '@trading-agent/shared';

/** 报告摘要（轻量，不含 opinions/risks 等大字段） */
export interface ReportSummary {
  id: string;
  symbol: string;
  title: string;
  date: string;
  conclusion: string;
  action: string;
  confidence: number;
  price: number;
  pattern: string | null;
  /** 观点标签列表（仅 role + signal，不含详情） */
  opinionTags: Array<{ role: string; signal: string | null }>;
}

/** Agent 配置摘要（轻量，不含 instructions 大字段） */
export interface AgentConfigSummary {
  id: string;
  name: string;
  description: string;
  model: string;
  metadata?: Record<string, unknown>;
}

/** Dashboard 聚合数据 */
export interface DashboardData {
  stats: {
    total: number;
    bySymbol: Record<string, number>;
    byAction: Record<string, number>;
  };
  recentReports: ReportSummary[];
}

// ── Report Hooks ──────────────────────────────────────────────────────

export function useReports(options?: { symbol?: string; limit?: number }) {
  const params = new URLSearchParams();
  if (options?.symbol) params.set('symbol', options.symbol);
  if (options?.limit) params.set('limit', String(options.limit));
  const qs = params.toString();

  return useQuery({
    queryKey: ['reports', options?.symbol, options?.limit],
    queryFn: () => apiFetch<{ reports: ResearchReport[] }>(`/reports${qs ? `?${qs}` : ''}`),
    staleTime: 30_000,
    placeholderData: previousData => previousData,
  });
}

export function useReport(id: string | null) {
  return useQuery({
    queryKey: ['report', id],
    queryFn: () => apiFetch<{ report: ResearchReport }>(`/reports/${id}`),
    enabled: !!id,
    staleTime: 60_000,
  });
}

export function useReportStats() {
  return useQuery({
    queryKey: ['report-stats'],
    queryFn: () =>
      apiFetch<{ stats: { total: number; bySymbol: Record<string, number>; byAction: Record<string, number> } }>(
        '/reports/stats',
      ),
    staleTime: 30_000,
    placeholderData: previousData => previousData,
  });
}

export function useDeleteReport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch(`/reports/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['reports'] });
      qc.invalidateQueries({ queryKey: ['report-stats'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

// ── Collaboration Hooks ───────────────────────────────────────────────

export function useStartCollaboration() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: {
      symbol: string;
      pattern?: string;
      participantAgentIds?: string[];
      supervisorAgentId?: string;
    }) =>
      apiFetch<{ result: ResearchReport | ResearchReport[] }>('/collaboration/start', {
        method: 'POST',
        body: JSON.stringify(params),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['reports'] });
      qc.invalidateQueries({ queryKey: ['report-stats'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

// ── Agent Config Hooks ────────────────────────────────────────────────

/** Dashboard 聚合 hook —— 一次请求获取统计 + 最近报告摘要 */
export function useDashboardData(recentLimit = 8) {
  return useQuery({
    queryKey: ['dashboard', recentLimit],
    queryFn: () =>
      apiFetch<DashboardData>(`/dashboard?recentLimit=${recentLimit}`),
    staleTime: 30_000,
    placeholderData: previousData => previousData,
  });
}

export function useAgentConfigs() {
  return useQuery({
    queryKey: ['agent-configs'],
    queryFn: () => apiFetch<{ agents: AgentConfig[] }>('/agents'),
    staleTime: 60_000,
  });
}

// ── Agent Reference Check Hooks ──────────────────────────────────────

/** Agent 引用关系（Team 成员、Supervisor、子 Agent） */
export interface AgentReference {
  type: 'team-member' | 'team-supervisor' | 'agent-subagent';
  entityId: string;
  entityName: string;
  entityUrl: string;
  isOnlyMember?: boolean;
}

/** 检查 Agent 引用关系 — 删除前调用 */
export function useAgentReferences(agentId: string | null, enabled?: boolean) {
  return useQuery({
    queryKey: ['agent-references', agentId],
    queryFn: () =>
      apiFetch<{ canDelete: boolean; references: AgentReference[] }>(
        `/agents/${agentId}/references`,
      ),
    enabled: !!agentId && (enabled ?? true),
    staleTime: 10_000,
  });
}

export function useAgentTemplates() {
  return useQuery({
    queryKey: ['agent-templates'],
    queryFn: () => apiFetch<{ templates: AgentTemplate[] }>('/agent-templates'),
    staleTime: 5 * 60_000,
  });
}

// ── Workflow Config Hooks ─────────────────────────────────────────────

export function useWorkflowConfigs() {
  return useQuery({
    queryKey: ['workflow-configs'],
    queryFn: () => apiFetch<{ configs: ResearchWorkflowConfig[] }>('/workflow-configs'),
    staleTime: 60_000,
  });
}

export function useCreateWorkflowConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: {
      name: string;
      pattern: string;
      participantAgentIds: string[];
      supervisorAgentId?: string;
      symbols?: string[];
    }) =>
      apiFetch<{ config: ResearchWorkflowConfig }>('/workflow-configs', {
        method: 'POST',
        body: JSON.stringify(params),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workflow-configs'] });
    },
  });
}

// ── Market Data Hooks ─────────────────────────────────────────────────

export function useMarketData(symbol: string | null, period?: string) {
  return useQuery({
    queryKey: ['market-data', symbol, period],
    queryFn: () =>
      apiFetch<{
        data: { symbol: string; latestPrice: number; klines: KLineData[]; dataPoints: number };
      }>(`/market-data/${symbol}${period ? `?period=${period}` : ''}`),
    enabled: !!symbol,
    staleTime: 60_000,
  });
}

export function useIndicators(symbol: string | null, period?: string) {
  return useQuery({
    queryKey: ['indicators', symbol, period],
    queryFn: () =>
      apiFetch<{
        symbol: string;
        latestPrice: number;
        indicators: Indicators;
        dataPoints: number;
      }>(`/indicators/${symbol}${period ? `?period=${period}` : ''}`),
    enabled: !!symbol,
    staleTime: 60_000,
  });
}

// ── Migration Hooks ──────────────────────────────────────────────────

/** 迁移状态 */
export interface MigrationStatus {
  agents: { total: number; ready: number; conflicts: number; skipped: number };
  skills: { total: number; ready: number; conflicts: number };
  backups: number;
  lastBackup: string | null;
}

/** 迁移执行结果 */
export interface MigrationResult {
  backup: { path: string; timestamp: string };
  agents: { migrated: Array<{ agentId: string; agentName: string; status: string; message?: string }>; totalSuccess: number; totalSkipped: number; totalErrors: number };
  skills: { migrated: Array<{ skillId: string; skillName: string; status: string; message?: string }>; totalSuccess: number; totalSkipped: number; totalErrors: number };
}

export function useMigrationStatus() {
  return useQuery({
    queryKey: ['migration-status'],
    queryFn: () => apiFetch<MigrationStatus>('/migrations/status'),
    staleTime: 30_000,
  });
}

export function useExecuteMigration() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: { conflictStrategy?: 'overwrite' | 'skip' | 'new-id' }) =>
      apiFetch<MigrationResult>('/migrations/execute', {
        method: 'POST',
        body: JSON.stringify(params),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['migration-status'] });
      qc.invalidateQueries({ queryKey: ['agent-configs'] });
    },
  });
}

export function useRollbackMigration() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: { timestamp: string }) =>
      apiFetch<{ agents: { restored: number; errors: number }; skills: { deleted: number; errors: number } }>(
        '/migrations/rollback',
        { method: 'POST', body: JSON.stringify(params) },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['migration-status'] });
      qc.invalidateQueries({ queryKey: ['agent-configs'] });
    },
  });
}

// ── Tool Execution History Hooks ────────────────────────────────────

export interface ToolExecutionRecord {
  id: string;
  toolId: string;
  status: 'success' | 'error';
  durationMs: number;
  errorMessage?: string;
  inputPreview?: string;
  outputPreview?: string;
  calledAt: string;
}

export interface ToolExecutionStats {
  totalCalls: number;
  successCount: number;
  errorCount: number;
  avgDurationMs: number;
  lastCalledAt: string | null;
}

export function useToolHistory(toolId: string | null, limit?: number) {
  return useQuery({
    queryKey: ['tool-history', toolId, limit],
    queryFn: () =>
      apiFetch<{ history: ToolExecutionRecord[]; stats: ToolExecutionStats }>(
        `/tools/${toolId}/history${limit ? `?limit=${limit}` : ''}`,
      ),
    enabled: !!toolId,
    staleTime: 10_000,
  });
}
