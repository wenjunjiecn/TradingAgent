import type { Client } from '@libsql/client';
import type { ResearchReport } from '@trading-agent/shared';
import { getDb } from '../db';

/**
 * 投研报告持久化存储
 *
 * 将 Supervisor 产出的结构化投研报告存入 LibSQL，支持列表、按 ID 查询和按标的筛选。
 *
 * 性能优化：报告的关键摘要字段（action/title/date/conclusion/confidence/price/pattern）
 * 以独立列存储，列表和统计查询不需要读取/解析完整 JSON 正文。
 */

const TABLE_NAME = 'research_reports';

let storeInitialized = false;

function getDbClient(): Client {
  return getDb();
}

/** 需要反范式化到独立列的摘要字段 */
const SUMMARY_COLUMNS: Array<{ col: string; type: string; jsonPath: string }> = [
  { col: 'action', type: 'TEXT', jsonPath: '$.action' },
  { col: 'title', type: 'TEXT', jsonPath: '$.title' },
  { col: 'date', type: 'TEXT', jsonPath: '$.date' },
  { col: 'conclusion', type: 'TEXT', jsonPath: '$.conclusion' },
  { col: 'confidence', type: 'REAL', jsonPath: '$.confidence' },
  { col: 'price', type: 'REAL', jsonPath: '$.price' },
  { col: 'pattern', type: 'TEXT', jsonPath: '$.pattern' },
];

/**
 * 从报告 opinions 数组中提取轻量标签 JSON（仅 role + signal，不含 details/summary 大字段）
 * 存入 opinion_tags 列，供列表页展示角色标签时使用。
 */
function extractOpinionTags(report: ResearchReport): string | null {
  if (!report.opinions || report.opinions.length === 0) return null;
  const tags = report.opinions.map(op => ({ role: op.role, signal: op.signal ?? null }));
  return JSON.stringify(tags);
}

/**
 * 迁移：为已有表添加摘要列并回填数据。
 * 使用 PRAGMA table_info 检测列是否已存在，保证幂等。
 */
async function migrateSummaryColumns(db: Client): Promise<void> {
  const pragma = await db.execute({ sql: `PRAGMA table_info(${TABLE_NAME})` });
  const existingCols = new Set(pragma.rows.map(r => (r as any).name));

  const toAdd = SUMMARY_COLUMNS.filter(c => !existingCols.has(c.col));
  if (toAdd.length === 0) return;

  // 逐列 ADD COLUMN（SQLite 不支持单条语句多列添加）
  for (const col of toAdd) {
    await db.execute({ sql: `ALTER TABLE ${TABLE_NAME} ADD COLUMN ${col.col} ${col.type}` });
  }

  // 回填已有行的摘要字段
  const setClauses = toAdd.map(c => `${c.col} = json_extract(report, '${c.jsonPath}')`).join(', ');
  await db.execute({ sql: `UPDATE ${TABLE_NAME} SET ${setClauses}` });
}

/** 确保报告表存在（仅首次调用真正执行 DDL，后续直接跳过） */
export async function initReportStore(): Promise<void> {
  if (storeInitialized) return;
  const db = getDbClient();
  await db.execute(`
    CREATE TABLE IF NOT EXISTS ${TABLE_NAME} (
      id TEXT PRIMARY KEY,
      symbol TEXT NOT NULL,
      report TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `);

  // 迁移：添加摘要列 + 回填
  await migrateSummaryColumns(db);

  // 迁移：添加 opinion_tags 列
  const pragma2 = await db.execute({ sql: `PRAGMA table_info(${TABLE_NAME})` });
  if (!pragma2.rows.some(r => (r as any).name === 'opinion_tags')) {
    await db.execute({ sql: `ALTER TABLE ${TABLE_NAME} ADD COLUMN opinion_tags TEXT` });
    // 回填：从已有 JSON 中提取 opinion 标签
    const rows = await db.execute({ sql: `SELECT id, report FROM ${TABLE_NAME} WHERE opinion_tags IS NULL` });
    for (const row of rows.rows) {
      try {
        const r = JSON.parse((row as any).report) as ResearchReport;
        const tags = extractOpinionTags(r);
        if (tags) {
          await db.execute({ sql: `UPDATE ${TABLE_NAME} SET opinion_tags = ? WHERE id = ?`, args: [tags, (row as any).id] });
        }
      } catch { /* skip malformed */ }
    }
  }

  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_${TABLE_NAME}_symbol ON ${TABLE_NAME}(symbol)
  `);
  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_${TABLE_NAME}_created_at ON ${TABLE_NAME}(created_at DESC)
  `);
  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_${TABLE_NAME}_action ON ${TABLE_NAME}(action)
  `);
  storeInitialized = true;
}

/** 生成报告 ID */
function generateReportId(): string {
  return `rpt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** 保存报告（同时写入摘要列 + opinion_tags） */
export async function saveReport(report: ResearchReport): Promise<ResearchReport> {
  const db = getDbClient();
  const id = report.id ?? generateReportId();
  const now = new Date().toISOString();
  const reportWithId: ResearchReport = { ...report, id };
  const opinionTags = extractOpinionTags(reportWithId);

  await db.execute({
    sql: `INSERT INTO ${TABLE_NAME} (id, symbol, report, created_at, action, title, date, conclusion, confidence, price, pattern, opinion_tags)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      id,
      report.symbol,
      JSON.stringify(reportWithId),
      now,
      report.action ?? null,
      report.title ?? null,
      report.date ?? null,
      report.conclusion ?? null,
      report.confidence ?? null,
      report.price ?? null,
      report.pattern ?? null,
      opinionTags,
    ],
  });

  return reportWithId;
}

/** 列出报告（可按标的筛选，默认按时间倒序）—— 返回完整报告对象 */
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

/** 报告摘要（轻量，不含 opinions/risks/trackingConditions 等大字段） */
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

/**
 * 列出报告摘要（不读取 report JSON 正文，仅查摘要列）
 * 适用于 Dashboard 最近报告列表等不需要完整报告内容的场景。
 */
export async function listReportSummaries(options?: {
  symbol?: string;
  limit?: number;
  offset?: number;
}): Promise<ReportSummary[]> {
  const db = getDbClient();
  const limit = options?.limit ?? 50;
  const offset = options?.offset ?? 0;

  let sql = `SELECT id, symbol, title, date, conclusion, action, confidence, price, pattern, opinion_tags FROM ${TABLE_NAME}`;
  const args: (string | number)[] = [];

  if (options?.symbol) {
    sql += ` WHERE symbol = ?`;
    args.push(options.symbol);
  }

  sql += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`;
  args.push(limit, offset);

  const result = await db.execute({ sql, args });
  return result.rows.map(row => ({
    id: (row as any).id,
    symbol: (row as any).symbol,
    title: (row as any).title ?? '',
    date: (row as any).date ?? '',
    conclusion: (row as any).conclusion ?? '',
    action: (row as any).action ?? 'UNKNOWN',
    confidence: (row as any).confidence ?? 0,
    price: (row as any).price ?? 0,
    pattern: (row as any).pattern ?? null,
    opinionTags: (row as any).opinion_tags ? JSON.parse((row as any).opinion_tags) : [],
  }));
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

/** 获取报告统计（使用 action 列 GROUP BY，无需解析 JSON） */
export async function getReportStats(): Promise<{
  total: number;
  bySymbol: Record<string, number>;
  byAction: Record<string, number>;
}> {
  const db = getDbClient();

  // 三条轻量 SQL 并行执行，全部走索引列，不触碰 report 正文
  const [totalResult, symbolResult, actionResult] = await Promise.all([
    db.execute({ sql: `SELECT COUNT(*) as total FROM ${TABLE_NAME}` }),
    db.execute({ sql: `SELECT symbol, COUNT(*) as cnt FROM ${TABLE_NAME} GROUP BY symbol` }),
    db.execute({
      sql: `SELECT COALESCE(action, 'UNKNOWN') as action, COUNT(*) as cnt FROM ${TABLE_NAME} GROUP BY action`,
    }),
  ]);

  const total = Number((totalResult.rows[0] as any)?.total ?? 0);

  const bySymbol: Record<string, number> = {};
  for (const row of symbolResult.rows) {
    bySymbol[(row as any).symbol] = Number((row as any).cnt);
  }

  const byAction: Record<string, number> = {};
  for (const row of actionResult.rows) {
    byAction[(row as any).action] = Number((row as any).cnt);
  }

  return { total, bySymbol, byAction };
}
