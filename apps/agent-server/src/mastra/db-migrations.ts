import type { Client } from '@libsql/client';
import { getDb } from './db';

/**
 * 数据库迁移管理
 *
 * 所有表创建和 schema 变更集中在此模块，
 * 业务模块（agent-registry、team-config-store 等）不应直接执行 DDL。
 */

let migrationsApplied = false;

/** 执行所有数据库迁移（幂等，仅首次调用执行） */
export async function runMigrations(): Promise<void> {
  if (migrationsApplied) return;
  const db = getDb();

  // 两张表的迁移互不依赖，并行执行以减少串行等待
  await Promise.all([
    migrateAgentConfigsTable(db),
    migrateAgentTeamsTable(db),
  ]);
  // 未来新增迁移在此添加

  migrationsApplied = true;
}

/** agent_configs 表迁移 */
async function migrateAgentConfigsTable(db: Client): Promise<void> {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS agent_configs (
      id TEXT PRIMARY KEY,
      config TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  // 迁移：添加摘要列
  const pragma = await db.execute({ sql: `PRAGMA table_info(agent_configs)` });
  const existingCols = new Set(pragma.rows.map(r => (r as any).name));
  const toAdd = [
    { col: 'name', type: 'TEXT' },
    { col: 'description', type: 'TEXT' },
    { col: 'model', type: 'TEXT' },
  ].filter(c => !existingCols.has(c.col));

  if (toAdd.length > 0) {
    // 使用 batch 并行执行所有 ALTER TABLE + UPDATE
    const statements: Array<{ sql: string; args?: unknown[] }> = [];
    for (const { col, type } of toAdd) {
      statements.push({ sql: `ALTER TABLE agent_configs ADD COLUMN ${col} ${type}` });
    }
    // SQLite 不支持单条多列 ADD，但 batch 会顺序执行所有语句
    await db.batch(statements.map(s => ({ sql: s.sql, args: (s.args ?? []) as never[] })));
    // 回填数据（单条 UPDATE 即可）
    const setClauses = toAdd.map(c => `${c.col} = json_extract(config, '$.${c.col}')`).join(', ');
    await db.execute({ sql: `UPDATE agent_configs SET ${setClauses}` });
  }
}

/** agent_teams 表迁移 */
async function migrateAgentTeamsTable(db: Client): Promise<void> {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS agent_teams (
      id TEXT PRIMARY KEY,
      config TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
}
