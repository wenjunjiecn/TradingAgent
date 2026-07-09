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

/** 内置工具友好显示名称映射 */
const TOOL_DISPLAY_NAMES: Record<string, string> = {
  'get-market-data': '行情数据获取',
  'technical-analysis': '技术指标分析',
  'news-sentiment': '新闻情绪分析',
  'fundamentals': '基本面数据',
};

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
      name: TOOL_DISPLAY_NAMES[tool.id] ?? tool.id,
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

/**
 * 种子化：同步内置工具到 DB
 *
 * 新增的内置工具完整插入；已存在的仅同步 isBuiltin 标记，
 * 不覆盖用户对 name/description/category/inputSchema/outputSchema 的编辑。
 * JSON 损坏的记录用种子数据覆盖修复。
 * 所有写操作通过 db.batch() 在单个事务中执行。
 */
async function seedBuiltinTools(): Promise<void> {
  const db = getDbClient();
  const seeds = buildBuiltinSeeds();
  const now = new Date().toISOString();

  // 先读取所有已存在的内置工具配置
  const seedIds = seeds.map(s => s.id);
  const placeholders = seedIds.map(() => '?').join(',');
  const existingResult = await db.execute({
    sql: `SELECT id, config FROM ${TABLE_NAME} WHERE id IN (${placeholders})`,
    args: seedIds,
  });

  const existingMap = new Map<string, ToolConfig | null>();
  for (const row of existingResult.rows) {
    const id = (row as any).id as string;
    try {
      existingMap.set(id, JSON.parse((row as any).config) as ToolConfig);
    } catch {
      existingMap.set(id, null); // JSON 损坏
    }
  }

  // 收集所有写操作
  const writeStatements: Array<{ sql: string; args: any[] }> = [];

  for (const seed of seeds) {
    const existing = existingMap.get(seed.id);

    if (existing === undefined) {
      // 新增内置工具 — 完整插入种子数据
      writeStatements.push({
        sql: `INSERT INTO ${TABLE_NAME} (id, config, created_at, updated_at) VALUES (?, ?, ?, ?)`,
        args: [seed.id, JSON.stringify(seed), seed.createdAt, now],
      });
    } else if (existing === null) {
      // JSON 损坏 — 用种子数据覆盖
      console.warn(`[ToolConfigStore] Corrupt config for "${seed.id}", overwriting with seed`);
      writeStatements.push({
        sql: `UPDATE ${TABLE_NAME} SET config = ?, updated_at = ? WHERE id = ?`,
        args: [JSON.stringify(seed), now, seed.id],
      });
    } else if (!existing.isBuiltin) {
      // 仅当 isBuiltin 标记不一致时才更新
      const updated: ToolConfig = {
        ...existing,
        isBuiltin: true,
        updatedAt: now,
      };
      writeStatements.push({
        sql: `UPDATE ${TABLE_NAME} SET config = ?, updated_at = ? WHERE id = ?`,
        args: [JSON.stringify(updated), now, seed.id],
      });
    }
    // else: 已存在且 isBuiltin 为 true — 不做任何操作
  }

  // 批量执行（libsql batch 自动包裹在事务中）
  if (writeStatements.length > 0) {
    await db.batch(writeStatements as never);
  }

  console.log(`[ToolConfigStore] Synced ${seeds.length} builtin tools (${writeStatements.length} writes)`);
}

let initPromise: Promise<void> | null = null;

/** 初始化工具配置存储（并发安全：使用 Promise 缓存避免竞态） */
export async function initToolConfigStore(): Promise<void> {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    await ensureTable();
    await seedBuiltinTools();
  })();
  return initPromise;
}

/** 安全解析工具配置 JSON，解析失败时返回 null */
function safeParseToolConfig(raw: unknown): ToolConfig | null {
  if (typeof raw !== 'string') return null;
  try {
    return JSON.parse(raw) as ToolConfig;
  } catch {
    console.error('[ToolConfigStore] Failed to parse tool config JSON');
    return null;
  }
}

/** 列出所有工具配置 */
export async function listToolConfigs(): Promise<ToolConfig[]> {
  await initToolConfigStore();
  const db = getDbClient();
  const result = await db.execute(`SELECT config FROM ${TABLE_NAME} ORDER BY created_at ASC`);
  return result.rows
    .map(row => safeParseToolConfig((row as any).config))
    .filter((t): t is ToolConfig => t !== null);
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
  return safeParseToolConfig((result.rows[0] as any).config);
}

/** 创建新工具配置 */
export async function createToolConfig(
  input: CreateToolConfigInput,
): Promise<ToolConfig> {
  await initToolConfigStore();
  const db = getDbClient();

  // 检查 ID 是否已存在
  const existing = await getToolConfig(input.id);
  if (existing) {
    throw new Error(`Tool ID "${input.id}" already exists`);
  }

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

/**
 * 获取所有已启用的工具 ID 集合。
 * 用于 Agent 实例化时过滤掉被禁用的工具。
 */
export async function getEnabledToolIds(): Promise<Set<string>> {
  const all = await listToolConfigs();
  return new Set(all.filter(t => t.enabled).map(t => t.id));
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
