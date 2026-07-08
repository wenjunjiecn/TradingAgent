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

  await migrateAgentConfigsTable(db);
  await migrateAgentTeamsTable(db);
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
  ];
  for (const { col, type } of toAdd) {
    if (!existingCols.has(col)) {
      await db.execute({ sql: `ALTER TABLE agent_configs ADD COLUMN ${col} ${type}` });
      await db.execute({ sql: `UPDATE agent_configs SET ${col} = json_extract(config, '$.${col}')` });
    }
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
