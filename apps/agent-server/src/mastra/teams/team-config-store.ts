import type { Client } from '@libsql/client';
import type {
  AgentTeamConfig,
  AgentTeamTemplate,
  TeamMember,
  CollaborationPattern,
} from '@trading-agent/shared';
import { agentTeamTemplates } from './team-templates';
import { getDb } from '../db';

/**
 * Agent Team 配置存储
 *
 * 管理 Agent Team 配置的持久化存储，使用 LibSQL。
 * 启动时自动从模板种子化默认团队，并迁移旧 workflow_configs 数据。
 */

const TABLE_NAME = 'agent_teams';
const OLD_TABLE_NAME = 'workflow_configs';

let storeInitialized = false;

function getDbClient(): Client {
  return getDb();
}

/** 确保 agent_teams 表存在 */
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

/** 从模板创建 AgentTeamConfig */
function configFromTemplate(template: AgentTeamTemplate): AgentTeamConfig {
  const now = new Date().toISOString();
  const id = template.id.replace('tpl-', 'team-');
  return {
    id,
    name: template.name,
    description: template.description,
    members: template.members.map(m => ({ ...m })),
    supervisorAgentId: template.supervisorAgentId,
    collaboration: { ...template.collaboration },
    teamInstructions: template.teamInstructions,
    sharedContext: template.sharedContext,
    outputFormat: template.outputFormat,
    sharedMemoryEnabled: template.sharedMemoryEnabled,
    defaultTarget: template.defaultTarget,
    isTemplate: false,
    tags: [...template.tags],
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * 迁移旧 workflow_configs 数据到 agent_teams
 *
 * 将 ResearchWorkflowConfig 转换为 AgentTeamConfig。
 */
async function migrateOldWorkflowConfigs(): Promise<number> {
  const db = getDbClient();

  // 检查旧表是否存在
  try {
    const checkResult = await db.execute(`SELECT name FROM sqlite_master WHERE type='table' AND name='${OLD_TABLE_NAME}'`);
    if (checkResult.rows.length === 0) return 0;
  } catch {
    return 0;
  }

  // 读取旧数据
  const oldResult = await db.execute(`SELECT config FROM ${OLD_TABLE_NAME}`);
  if (oldResult.rows.length === 0) return 0;

  let migrated = 0;
  const now = new Date().toISOString();

  for (const row of oldResult.rows) {
    try {
      const oldConfig = JSON.parse((row as any).config) as {
        id: string;
        name: string;
        pattern: CollaborationPattern;
        participantAgentIds: string[];
        supervisorAgentId?: string;
        symbols?: string[];
        createdAt: string;
        updatedAt: string;
      };

      // 检查是否已迁移（避免重复）
      const existing = await db.execute({
        sql: `SELECT id FROM ${TABLE_NAME} WHERE id = ?`,
        args: [oldConfig.id],
      });
      if (existing.rows.length > 0) continue;

      // 转换为 AgentTeamConfig
      const members: TeamMember[] = oldConfig.participantAgentIds.map((agentId, i) => ({
        agentId,
        role: 'analyst' as const,
        weight: 1,
        order: i,
      }));

      const newConfig: AgentTeamConfig = {
        id: oldConfig.id,
        name: oldConfig.name,
        description: '迁移自旧工作流配置',
        members,
        supervisorAgentId: oldConfig.supervisorAgentId,
        collaboration: {
          pattern: oldConfig.pattern,
          rounds: 1,
          passThroughContext: true,
          targets: oldConfig.symbols,
        },
        outputFormat: 'research-report',
        sharedMemoryEnabled: false,
        isTemplate: false,
        tags: ['migrated'],
        createdAt: oldConfig.createdAt,
        updatedAt: now,
      };

      await db.execute({
        sql: `INSERT INTO ${TABLE_NAME} (id, config, created_at, updated_at) VALUES (?, ?, ?, ?)`,
        args: [newConfig.id, JSON.stringify(newConfig), newConfig.createdAt, now],
      });
      migrated++;
    } catch (err) {
      console.warn(`[TeamConfigStore] Failed to migrate workflow config:`, err instanceof Error ? err.message : String(err));
    }
  }

  // 清空旧表（不删除，保留作为备份）
  if (migrated > 0) {
    console.log(`[TeamConfigStore] Migrated ${migrated} workflow configs to agent_teams`);
  }

  return migrated;
}

/** 种子化：如果表中无数据，从模板插入默认团队 */
async function seedDefaults(): Promise<void> {
  const db = getDbClient();
  const result = await db.execute(`SELECT COUNT(*) as count FROM ${TABLE_NAME}`);
  const count = (result.rows[0] as any)?.count ?? 0;
  if (Number(count) > 0) return;

  for (const template of agentTeamTemplates) {
    const config = configFromTemplate(template);
    const now = new Date().toISOString();
    await db.execute({
      sql: `INSERT INTO ${TABLE_NAME} (id, config, created_at, updated_at) VALUES (?, ?, ?, ?)`,
      args: [config.id, JSON.stringify(config), now, now],
    });
  }

  console.log(`[TeamConfigStore] Seeded ${agentTeamTemplates.length} default teams`);
}

/** 初始化 Team 配置存储（仅首次调用执行完整初始化） */
export async function initTeamConfigStore(): Promise<void> {
  if (storeInitialized) return;
  await ensureTable();
  await migrateOldWorkflowConfigs();
  await seedDefaults();
  storeInitialized = true;
}

/** 列出所有 Team 配置 */
export async function listTeamConfigs(): Promise<AgentTeamConfig[]> {
  const db = getDbClient();
  const result = await db.execute(`SELECT config FROM ${TABLE_NAME} ORDER BY created_at ASC`);
  return result.rows.map(row => JSON.parse((row as any).config) as AgentTeamConfig);
}

/** 获取单个 Team 配置 */
export async function getTeamConfig(id: string): Promise<AgentTeamConfig | null> {
  const db = getDbClient();
  const result = await db.execute({
    sql: `SELECT config FROM ${TABLE_NAME} WHERE id = ?`,
    args: [id],
  });
  if (result.rows.length === 0) return null;
  return JSON.parse((result.rows[0] as any).config) as AgentTeamConfig;
}

/** 创建新 Team 配置 */
export async function createTeamConfig(
  config: Omit<AgentTeamConfig, 'createdAt' | 'updatedAt' | 'isTemplate'>,
): Promise<AgentTeamConfig> {
  const db = getDbClient();
  const now = new Date().toISOString();
  const fullConfig: AgentTeamConfig = {
    ...config,
    isTemplate: false,
    createdAt: now,
    updatedAt: now,
  };

  await db.execute({
    sql: `INSERT INTO ${TABLE_NAME} (id, config, created_at, updated_at) VALUES (?, ?, ?, ?)`,
    args: [fullConfig.id, JSON.stringify(fullConfig), now, now],
  });

  return fullConfig;
}

/** 更新 Team 配置 */
export async function updateTeamConfig(
  id: string,
  updates: Partial<AgentTeamConfig>,
): Promise<AgentTeamConfig | null> {
  const existing = await getTeamConfig(id);
  if (!existing) return null;

  const now = new Date().toISOString();
  const updated: AgentTeamConfig = {
    ...existing,
    ...updates,
    id: existing.id, // ID 不可更改
    updatedAt: now,
  };

  const db = getDbClient();
  await db.execute({
    sql: `UPDATE ${TABLE_NAME} SET config = ?, updated_at = ? WHERE id = ?`,
    args: [JSON.stringify(updated), now, id],
  });

  return updated;
}

/** 删除 Team 配置 */
export async function deleteTeamConfig(id: string): Promise<boolean> {
  const db = getDbClient();
  const result = await db.execute({
    sql: `DELETE FROM ${TABLE_NAME} WHERE id = ?`,
    args: [id],
  });
  return (result.rowsAffected ?? 0) > 0;
}

/** 从模板创建新 Team */
export async function createTeamFromTemplate(
  templateId: string,
  customName?: string,
): Promise<AgentTeamConfig | null> {
  const template = agentTeamTemplates.find(t => t.id === templateId);
  if (!template) return null;

  const suffix = Date.now().toString(36).slice(-6);
  const id = `${template.id.replace('tpl-', 'team-')}-${suffix}`;

  return createTeamConfig({
    id,
    name: customName ?? template.name,
    description: template.description,
    members: template.members.map(m => ({ ...m })),
    supervisorAgentId: template.supervisorAgentId,
    collaboration: { ...template.collaboration },
    teamInstructions: template.teamInstructions,
    sharedContext: template.sharedContext,
    outputFormat: template.outputFormat,
    sharedMemoryEnabled: template.sharedMemoryEnabled,
    defaultTarget: template.defaultTarget,
    tags: [...template.tags],
  });
}
