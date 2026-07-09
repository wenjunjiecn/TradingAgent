import type { Client } from '@libsql/client';
import type { ToolConfig, CreateToolConfigInput } from '@trading-agent/shared';
import { getDb } from '../db';
import { toolRegistry } from './tool-registry';

/**
 * 工具配置存储
 *
 * 管理工具的元数据配置（名称、描述、分类、执行类型、启用状态等），
 * 支持前端 CRUD 操作。内置工具从 toolRegistry 种子化，不可删除。
 *
 * v2: ToolConfig 新增 type 字段 (builtin/http/mcp)，inputSchema/outputSchema
 *     从 string 改为 Record<string, any> (JSON Schema 对象)。
 *     旧数据通过 migrateToolConfigs() 自动迁移。
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

/**
 * v1 → v2 数据迁移
 *
 * - inputSchema/outputSchema: string → JSON.parse → object
 * - 新增 type 字段: 默认 builtin (内置) 或 http (自定义)
 * - 幂等: 已迁移的记录不重复处理
 */
async function migrateToolConfigs(): Promise<void> {
  const db = getDbClient();
  const result = await db.execute(`SELECT id, config FROM ${TABLE_NAME}`);

  const updates: Array<{ sql: string; args: any[] }> = [];

  for (const row of result.rows) {
    const raw = (row as any).config as string;
    try {
      const config = JSON.parse(raw);

      // 检测旧格式: inputSchema/outputSchema 是 string 或 type 缺失
      const needsMigration =
        typeof config.inputSchema === 'string' ||
        typeof config.outputSchema === 'string' ||
        config.type === undefined;

      if (!needsMigration) continue;

      // 迁移 inputSchema: string → parsed object
      if (typeof config.inputSchema === 'string') {
        try {
          config.inputSchema = config.inputSchema ? JSON.parse(config.inputSchema) : undefined;
        } catch {
          config.inputSchema = undefined;
        }
      }

      // 迁移 outputSchema: string → parsed object
      if (typeof config.outputSchema === 'string') {
        try {
          config.outputSchema = config.outputSchema ? JSON.parse(config.outputSchema) : undefined;
        } catch {
          config.outputSchema = undefined;
        }
      }

      // 新增 type 字段
      if (!config.type) {
        config.type = config.isBuiltin ? 'builtin' : 'http';
      }

      const now = new Date().toISOString();
      updates.push({
        sql: `UPDATE ${TABLE_NAME} SET config = ?, updated_at = ? WHERE id = ?`,
        args: [JSON.stringify(config), now, config.id],
      });
    } catch {
      // 跳过损坏记录
    }
  }

  if (updates.length > 0) {
    await db.batch(updates as never);
    console.log(`[ToolConfigStore] Migrated ${updates.length} tool configs to v2`);
  }
}

/** 内置工具友好显示名称映射 */
const TOOL_DISPLAY_NAMES: Record<string, string> = {
  'get-market-data': '行情数据获取',
  'technical-analysis': '技术指标分析',
  'news-sentiment': '新闻情绪分析',
  'fundamentals': '基本面数据',
};

/**
 * 将 Zod schema 的 .toJSON() / 内部结构转为 JSON Schema 对象
 *
 * Mastra createTool 的 inputSchema/outputSchema 是 Zod schema，
 * 我们需要将其转为 JSON Schema 对象存入 DB。
 * 使用 zod-to-json-schema 的轻量替代: 直接从 Zod 内部结构提取。
 */
function zodToJsonSchema(zodSchema: any): Record<string, any> | undefined {
  if (!zodSchema) return undefined;
  try {
    // Zod v3: 使用 _def 递归提取
    // 简化实现: 如果 Zod schema 有 .toJSON() 方法就用它
    if (typeof zodSchema.toJSON === 'function') {
      return zodSchema.toJSON();
    }
    // 否则尝试使用 zod-to-json-schema (如果安装了)
    // 兜底: 返回 undefined
    return undefined;
  } catch {
    return undefined;
  }
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
    // 尝试将 Zod schema 转为 JSON Schema 对象
    const inputJsonSchema = zodToJsonSchema(tool.inputSchema);
    const outputJsonSchema = zodToJsonSchema(tool.outputSchema);

    return {
      id: tool.id,
      name: TOOL_DISPLAY_NAMES[tool.id] ?? tool.id,
      description: tool.description ?? '',
      category: categoryMap[tool.id] ?? 'custom',
      type: 'builtin' as const,
      enabled: true,
      isBuiltin: true,
      inputSchema: inputJsonSchema,
      outputSchema: outputJsonSchema,
      config: {},
      createdAt: now,
      updatedAt: now,
    };
  });
}

/**
 * 种子化：同步内置工具到 DB
 *
 * 新增的内置工具完整插入；已存在的仅同步 isBuiltin 和 type 标记，
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
    } else {
      // 已存在 — 确保至少 isBuiltin 和 type 正确
      const needsUpdate = !existing.isBuiltin || !existing.type || existing.type !== 'builtin';
      if (needsUpdate) {
        const updated: ToolConfig = {
          ...existing,
          isBuiltin: true,
          type: 'builtin',
          updatedAt: now,
        };
        writeStatements.push({
          sql: `UPDATE ${TABLE_NAME} SET config = ?, updated_at = ? WHERE id = ?`,
          args: [JSON.stringify(updated), now, seed.id],
        });
      }
    }
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
    await migrateToolConfigs();
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
