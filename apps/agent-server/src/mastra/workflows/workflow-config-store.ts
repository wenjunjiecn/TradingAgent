import { createClient, type Client } from '@libsql/client';
import type { ResearchWorkflowConfig, CollaborationPattern } from '@trading-agent/shared';

/**
 * 投研工作流配置存储
 *
 * 管理工作流配置的持久化，用户可保存常用的 agent 组合 + 协作模式为模板。
 */

const DB_URL = 'file:./mastra.db';
const TABLE_NAME = 'workflow_configs';

let dbClient: Client | null = null;

function getDbClient(): Client {
  if (!dbClient) {
    dbClient = createClient({ url: DB_URL });
  }
  return dbClient;
}

async function ensureTable(): Promise<void> {
  const db = getDbClient();
  await db.execute(`
    CREATE TABLE IF NOT EXISTS ${TABLE_NAME} (
      id TEXT PRIMARY KEY,
      config TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
}

/** 初始化 */
export async function initWorkflowConfigStore(): Promise<void> {
  await ensureTable();
}

/** 列出所有工作流配置 */
export async function listWorkflowConfigs(): Promise<ResearchWorkflowConfig[]> {
  const db = getDbClient();
  const result = await db.execute(`SELECT config FROM ${TABLE_NAME} ORDER BY created_at ASC`);
  return result.rows.map(row => JSON.parse((row as any).config) as ResearchWorkflowConfig);
}

/** 获取单个工作流配置 */
export async function getWorkflowConfig(id: string): Promise<ResearchWorkflowConfig | null> {
  const db = getDbClient();
  const result = await db.execute({
    sql: `SELECT config FROM ${TABLE_NAME} WHERE id = ?`,
    args: [id],
  });
  if (result.rows.length === 0) return null;
  return JSON.parse((result.rows[0] as any).config) as ResearchWorkflowConfig;
}

/** 创建工作流配置 */
export async function createWorkflowConfig(
  name: string,
  pattern: CollaborationPattern,
  participantAgentIds: string[],
  supervisorAgentId?: string,
  symbols?: string[],
): Promise<ResearchWorkflowConfig> {
  const db = getDbClient();
  const now = new Date().toISOString();
  const id = `wf-${Date.now().toString(36)}`;
  const config: ResearchWorkflowConfig = {
    id,
    name,
    pattern,
    participantAgentIds,
    supervisorAgentId,
    symbols,
    createdAt: now,
    updatedAt: now,
  };

  await db.execute({
    sql: `INSERT INTO ${TABLE_NAME} (id, config, created_at, updated_at) VALUES (?, ?, ?, ?)`,
    args: [config.id, JSON.stringify(config), now, now],
  });

  return config;
}

/** 更新工作流配置 */
export async function updateWorkflowConfig(
  id: string,
  updates: Partial<ResearchWorkflowConfig>,
): Promise<ResearchWorkflowConfig | null> {
  const existing = await getWorkflowConfig(id);
  if (!existing) return null;

  const now = new Date().toISOString();
  const updated: ResearchWorkflowConfig = {
    ...existing,
    ...updates,
    id: existing.id,
    updatedAt: now,
  };

  const db = getDbClient();
  await db.execute({
    sql: `UPDATE ${TABLE_NAME} SET config = ?, updated_at = ? WHERE id = ?`,
    args: [JSON.stringify(updated), now, id],
  });

  return updated;
}

/** 删除工作流配置 */
export async function deleteWorkflowConfig(id: string): Promise<boolean> {
  const db = getDbClient();
  const result = await db.execute({
    sql: `DELETE FROM ${TABLE_NAME} WHERE id = ?`,
    args: [id],
  });
  return (result.rowsAffected ?? 0) > 0;
}
