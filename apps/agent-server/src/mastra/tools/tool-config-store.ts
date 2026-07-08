import type { Client } from '@libsql/client';
import type { ToolConfig, CreateToolConfigInput } from '@trading-agent/shared';
import { getDb } from '../db';
import { toolRegistry } from './tool-registry';

/**
 * 工具配置存储
 *
 * 管理工具的元数据配置（名称、描述、分类、启用状态等），
 * 支持前端 CRUD 操作。内置工具从 toolRegistry 种子化，不可删除。
 */

const TABLE_NAME = 'tool_configs';

function getDbClient(): Client {
  return getDb();
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

/** 从 toolRegistry 构建内置工具配置种子 */
function buildBuiltinSeeds(): ToolConfig[] {
  const now = new Date().toISOString();
  const categoryMap: Record<string, ToolConfig['category']> = {
    'get-market-data': 'market-data',
    'technical-analysis': 'technical-analysis',
    'news-sentiment': 'news-sentiment',
    'fundamentals': 'fundamentals',
  };

  return Object.values(toolRegistry).map((tool: any) => {
    const inputSchemaStr = tool.inputSchema
      ? JSON.stringify(tool.inputSchema, null, 2)
      : undefined;
    const outputSchemaStr = tool.outputSchema
      ? JSON.stringify(tool.outputSchema, null, 2)
      : undefined;

    return {
      id: tool.id,
      name: tool.id,
      description: tool.description ?? '',
      category: categoryMap[tool.id] ?? 'custom',
      enabled: true,
      isBuiltin: true,
      inputSchema: inputSchemaStr,
      outputSchema: outputSchemaStr,
      config: {},
      createdAt: now,
      updatedAt: now,
    };
  });
}

/** 种子化：同步内置工具到 DB（新增的插入，已存在的更新描述） */
async function seedBuiltinTools(): Promise<void> {
  const db = getDbClient();
  const seeds = buildBuiltinSeeds();
  const now = new Date().toISOString();

  for (const seed of seeds) {
    const existing = await db.execute({
      sql: `SELECT id FROM ${TABLE_NAME} WHERE id = ?`,
      args: [seed.id],
    });

    if (existing.rows.length === 0) {
      // 新增内置工具
      await db.execute({
        sql: `INSERT INTO ${TABLE_NAME} (id, config, created_at, updated_at) VALUES (?, ?, ?, ?)`,
        args: [seed.id, JSON.stringify(seed), seed.createdAt, now],
      });
    } else {
      // 更新内置工具的描述/schema（保留用户的 enabled 和 config 设置）
      const existingConfig = await db.execute({
        sql: `SELECT config FROM ${TABLE_NAME} WHERE id = ?`,
        args: [seed.id],
      });
      if (existingConfig.rows.length > 0) {
        try {
          const old: ToolConfig = JSON.parse((existingConfig.rows[0] as any).config);
          const updated: ToolConfig = {
            ...old,
            name: seed.name,
            description: seed.description,
            category: seed.category,
            isBuiltin: true,
            inputSchema: seed.inputSchema,
            outputSchema: seed.outputSchema,
            updatedAt: now,
          };
          await db.execute({
            sql: `UPDATE ${TABLE_NAME} SET config = ?, updated_at = ? WHERE id = ?`,
            args: [JSON.stringify(updated), now, seed.id],
          });
        } catch {
          // 解析失败则跳过
        }
      }
    }
  }

  console.log(`[ToolConfigStore] Synced ${seeds.length} builtin tools`);
}

let storeInitialized = false;

/** 初始化工具配置存储 */
export async function initToolConfigStore(): Promise<void> {
  if (storeInitialized) return;
  await ensureTable();
  await seedBuiltinTools();
  storeInitialized = true;
}

/** 列出所有工具配置 */
export async function listToolConfigs(): Promise<ToolConfig[]> {
  await initToolConfigStore();
  const db = getDbClient();
  const result = await db.execute(`SELECT config FROM ${TABLE_NAME} ORDER BY created_at ASC`);
  return result.rows.map(row => JSON.parse((row as any).config) as ToolConfig);
}

/** 获取单个工具配置 */
export async function getToolConfig(id: string): Promise<ToolConfig | null> {
  await initToolConfigStore();
  const db = getDbClient();
  const result = await db.execute({
    sql: `SELECT config FROM ${TABLE_NAME} WHERE id = ?`,
    args: [id],
  });
  if (result.rows.length === 0) return null;
  return JSON.parse((result.rows[0] as any).config) as ToolConfig;
}

/** 创建新工具配置 */
export async function createToolConfig(
  input: CreateToolConfigInput,
): Promise<ToolConfig> {
  await initToolConfigStore();
  const db = getDbClient();
  const now = new Date().toISOString();
  const config: ToolConfig = {
    ...input,
    isBuiltin: false,
    createdAt: now,
    updatedAt: now,
  };

  await db.execute({
    sql: `INSERT INTO ${TABLE_NAME} (id, config, created_at, updated_at) VALUES (?, ?, ?, ?)`,
    args: [config.id, JSON.stringify(config), now, now],
  });

  return config;
}

/** 更新工具配置 */
export async function updateToolConfig(
  id: string,
  updates: Partial<ToolConfig>,
): Promise<ToolConfig | null> {
  await initToolConfigStore();
  const existing = await getToolConfig(id);
  if (!existing) return null;

  const now = new Date().toISOString();
  const updated: ToolConfig = {
    ...existing,
    ...updates,
    id: existing.id, // ID 不可更改
    isBuiltin: existing.isBuiltin, // isBuiltin 不可更改
    createdAt: existing.createdAt, // createdAt 不可更改
    updatedAt: now,
  };

  const db = getDbClient();
  await db.execute({
    sql: `UPDATE ${TABLE_NAME} SET config = ?, updated_at = ? WHERE id = ?`,
    args: [JSON.stringify(updated), now, id],
  });

  return updated;
}

/** 删除工具配置（内置工具不可删除） */
export async function deleteToolConfig(id: string): Promise<boolean> {
  await initToolConfigStore();
  const existing = await getToolConfig(id);
  if (!existing) return false;
  if (existing.isBuiltin) {
    throw new Error('Cannot delete builtin tool');
  }

  const db = getDbClient();
  const result = await db.execute({
    sql: `DELETE FROM ${TABLE_NAME} WHERE id = ?`,
    args: [id],
  });
  return (result.rowsAffected ?? 0) > 0;
}
