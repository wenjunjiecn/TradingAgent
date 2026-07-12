import type { Client } from '@libsql/client';
import { getDb } from '../db';

/**
 * Tool 执行历史记录
 *
 * 记录最近 Tool 调用的时间、状态、延迟和错误，
 * 存入 DB（tool_execution_history 表），供 Tool 详情页展示。
 */

const TABLE_NAME = 'tool_execution_history';
const MAX_HISTORY_PER_TOOL = 100;

function getDbClient(): Client {
  return getDb();
}

/** 执行历史记录 */
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

let tableInitialized = false;

async function ensureTable(): Promise<void> {
  if (tableInitialized) return;
  const db = getDbClient();
  await db.execute(`
    CREATE TABLE IF NOT EXISTS ${TABLE_NAME} (
      id TEXT PRIMARY KEY,
      tool_id TEXT NOT NULL,
      status TEXT NOT NULL,
      duration_ms INTEGER NOT NULL,
      error_message TEXT,
      input_preview TEXT,
      output_preview TEXT,
      called_at TEXT NOT NULL
    )
  `);
  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_${TABLE_NAME}_tool_id ON ${TABLE_NAME}(tool_id, called_at DESC)
  `);
  tableInitialized = true;
}

/**
 * 记录一次 Tool 执行
 */
export async function recordToolExecution(
  toolId: string,
  status: 'success' | 'error',
  durationMs: number,
  options?: {
    errorMessage?: string;
    inputPreview?: string;
    outputPreview?: string;
  },
): Promise<void> {
  await ensureTable();
  const db = getDbClient();
  const id = `${toolId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const calledAt = new Date().toISOString();

  await db.execute({
    sql: `INSERT INTO ${TABLE_NAME} (id, tool_id, status, duration_ms, error_message, input_preview, output_preview, called_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      id,
      toolId,
      status,
      durationMs,
      options?.errorMessage ?? null,
      options?.inputPreview ?? null,
      options?.outputPreview ?? null,
      calledAt,
    ],
  });

  // 清理旧记录：每个工具最多保留 MAX_HISTORY_PER_TOOL 条
  await db.execute({
    sql: `DELETE FROM ${TABLE_NAME} WHERE tool_id = ? AND id NOT IN (
      SELECT id FROM ${TABLE_NAME} WHERE tool_id = ? ORDER BY called_at DESC LIMIT ?
    )`,
    args: [toolId, toolId, MAX_HISTORY_PER_TOOL],
  });
}

/**
 * 获取 Tool 执行历史
 */
export async function getToolExecutionHistory(
  toolId: string,
  limit: number = 20,
): Promise<ToolExecutionRecord[]> {
  await ensureTable();
  const db = getDbClient();
  const result = await db.execute({
    sql: `SELECT id, tool_id, status, duration_ms, error_message, input_preview, output_preview, called_at
      FROM ${TABLE_NAME} WHERE tool_id = ? ORDER BY called_at DESC LIMIT ?`,
    args: [toolId, limit],
  });

  return result.rows.map(row => ({
    id: (row as any).id,
    toolId: (row as any).tool_id,
    status: (row as any).status,
    durationMs: (row as any).duration_ms,
    errorMessage: (row as any).error_message ?? undefined,
    inputPreview: (row as any).input_preview ?? undefined,
    outputPreview: (row as any).output_preview ?? undefined,
    calledAt: (row as any).called_at,
  }));
}

/**
 * 获取 Tool 执行统计
 */
export async function getToolExecutionStats(
  toolId: string,
): Promise<{
  totalCalls: number;
  successCount: number;
  errorCount: number;
  avgDurationMs: number;
  lastCalledAt: string | null;
}> {
  await ensureTable();
  const db = getDbClient();
  const result = await db.execute({
    sql: `SELECT
      COUNT(*) as total,
      SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as success_count,
      SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) as error_count,
      AVG(duration_ms) as avg_duration,
      MAX(called_at) as last_called
    FROM ${TABLE_NAME} WHERE tool_id = ?`,
    args: [toolId],
  });

  const row = result.rows[0] as any;
  return {
    totalCalls: row?.total ?? 0,
    successCount: row?.success_count ?? 0,
    errorCount: row?.error_count ?? 0,
    avgDurationMs: Math.round(row?.avg_duration ?? 0),
    lastCalledAt: row?.last_called ?? null,
  };
}
