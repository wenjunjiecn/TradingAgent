import { createClient, type Client } from '@libsql/client';
import type { ResearchReport } from '@trading-agent/shared';

/**
 * 投研报告持久化存储
 *
 * 将 Supervisor 产出的结构化投研报告存入 LibSQL，支持列表、按 ID 查询和按标的筛选。
 */

const DB_URL = 'file:./mastra.db';
const TABLE_NAME = 'research_reports';

let dbClient: Client | null = null;

function getDbClient(): Client {
  if (!dbClient) {
    dbClient = createClient({ url: DB_URL });
  }
  return dbClient;
}

/** 确保报告表存在 */
export async function initReportStore(): Promise<void> {
  const db = getDbClient();
  await db.execute(`
    CREATE TABLE IF NOT EXISTS ${TABLE_NAME} (
      id TEXT PRIMARY KEY,
      symbol TEXT NOT NULL,
      report TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `);
  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_${TABLE_NAME}_symbol ON ${TABLE_NAME}(symbol)
  `);
  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_${TABLE_NAME}_created_at ON ${TABLE_NAME}(created_at DESC)
  `);
}

/** 生成报告 ID */
function generateReportId(): string {
  return `rpt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** 保存报告 */
export async function saveReport(report: ResearchReport): Promise<ResearchReport> {
  const db = getDbClient();
  const id = report.id ?? generateReportId();
  const now = new Date().toISOString();
  const reportWithId: ResearchReport = { ...report, id };

  await db.execute({
    sql: `INSERT INTO ${TABLE_NAME} (id, symbol, report, created_at) VALUES (?, ?, ?, ?)`,
    args: [id, report.symbol, JSON.stringify(reportWithId), now],
  });

  return reportWithId;
}

/** 列出报告（可按标的筛选，默认按时间倒序） */
export async function listReports(options?: {
  symbol?: string;
  limit?: number;
  offset?: number;
}): Promise<ResearchReport[]> {
  const db = getDbClient();
  const limit = options?.limit ?? 50;
  const offset = options?.offset ?? 0;

  let sql = `SELECT report FROM ${TABLE_NAME}`;
  const args: (string | number)[] = [];

  if (options?.symbol) {
    sql += ` WHERE symbol = ?`;
    args.push(options.symbol);
  }

  sql += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`;
  args.push(limit, offset);

  const result = await db.execute({ sql, args });
  return result.rows.map(row => JSON.parse((row as any).report) as ResearchReport);
}

/** 获取单份报告 */
export async function getReport(id: string): Promise<ResearchReport | null> {
  const db = getDbClient();
  const result = await db.execute({
    sql: `SELECT report FROM ${TABLE_NAME} WHERE id = ?`,
    args: [id],
  });
  if (result.rows.length === 0) return null;
  return JSON.parse((result.rows[0] as any).report) as ResearchReport;
}

/** 删除报告 */
export async function deleteReport(id: string): Promise<boolean> {
  const db = getDbClient();
  const result = await db.execute({
    sql: `DELETE FROM ${TABLE_NAME} WHERE id = ?`,
    args: [id],
  });
  return (result.rowsAffected ?? 0) > 0;
}

/** 获取报告统计 */
export async function getReportStats(): Promise<{
  total: number;
  bySymbol: Record<string, number>;
  byAction: Record<string, number>;
}> {
  const db = getDbClient();
  const result = await db.execute(`SELECT report FROM ${TABLE_NAME} ORDER BY created_at DESC`);

  const reports = result.rows.map(row => JSON.parse((row as any).report) as ResearchReport);
  const bySymbol: Record<string, number> = {};
  const byAction: Record<string, number> = {};

  for (const r of reports) {
    bySymbol[r.symbol] = (bySymbol[r.symbol] ?? 0) + 1;
    const action = r.action ?? 'UNKNOWN';
    byAction[action] = (byAction[action] ?? 0) + 1;
  }

  return { total: reports.length, bySymbol, byAction };
}
