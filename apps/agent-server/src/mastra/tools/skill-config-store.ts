import type { Client } from '@libsql/client';
import type { SkillConfig, CreateSkillConfigInput } from '@trading-agent/shared';
import { getDb } from '../db';

/**
 * 技能配置存储
 *
 * 管理技能的元数据配置（名称、描述、分类、启用状态、提示词内容等），
 * 支持前端 CRUD 操作。
 */

const TABLE_NAME = 'skill_configs';

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

/** 内置技能种子 */
function buildBuiltinSeeds(): SkillConfig[] {
  const now = new Date().toISOString();
  return [
    {
      id: 'daily-market-brief',
      name: '每日市场简报',
      description: '生成每日美股市场概览，包含大盘走势、板块轮动和关键事件',
      category: 'research',
      enabled: true,
      isBuiltin: true,
      content: '你是一个美股市场分析助手。请根据最新的市场数据，生成一份简洁的市场简报，包含：\n1. 大盘指数走势（SPY/QQQ/DJI）\n2. 板块涨跌排名\n3. 当日关键经济数据和事件\n4. 市场情绪指标（VIX）',
      triggers: ['market brief', '市场简报', 'daily report', '每日简报'],
      config: {},
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'technical-analysis',
      name: '技术分析',
      description: '对指定标的进行技术指标分析，包含MA、RSI、MACD等',
      category: 'analysis',
      enabled: true,
      isBuiltin: true,
      content: '你是一个技术分析专家。请对给定标的进行以下分析：\n1. 趋势判断（MA20/MA60 金叉死叉）\n2. 动量指标（RSI 超买超卖）\n3. MACD 柱状图信号\n4. 支撑位和阻力位\n5. 综合技术信号评分',
      triggers: ['technical', '技术分析', 'TA', 'indicator'],
      config: {},
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'risk-assessment',
      name: '风险评估',
      description: '评估投资组合或单只股票的风险敞口',
      category: 'risk-management',
      enabled: true,
      isBuiltin: true,
      content: '你是一个风险管理专家。请从以下维度评估风险：\n1. 波动率分析\n2. Beta 系数\n3. 最大回撤\n4. 行业集中度\n5. 宏观风险因子\n给出风险评级（低/中/高）和具体建议。',
      triggers: ['risk', '风险', 'exposure', '波动率'],
      config: {},
      createdAt: now,
      updatedAt: now,
    },
  ];
}

/** 种子化：同步内置技能到 DB */
async function seedBuiltinSkills(): Promise<void> {
  const db = getDbClient();
  const seeds = buildBuiltinSeeds();
  const now = new Date().toISOString();

  for (const seed of seeds) {
    const existing = await db.execute({
      sql: `SELECT id FROM ${TABLE_NAME} WHERE id = ?`,
      args: [seed.id],
    });

    if (existing.rows.length === 0) {
      await db.execute({
        sql: `INSERT INTO ${TABLE_NAME} (id, config, created_at, updated_at) VALUES (?, ?, ?, ?)`,
        args: [seed.id, JSON.stringify(seed), seed.createdAt, now],
      });
    } else {
      const existingConfig = await db.execute({
        sql: `SELECT config FROM ${TABLE_NAME} WHERE id = ?`,
        args: [seed.id],
      });
      if (existingConfig.rows.length > 0) {
        try {
          const old: SkillConfig = JSON.parse((existingConfig.rows[0] as any).config);
          const updated: SkillConfig = {
            ...old,
            name: seed.name,
            description: seed.description,
            category: seed.category,
            isBuiltin: true,
            content: seed.content,
            triggers: seed.triggers,
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

  console.log(`[SkillConfigStore] Synced ${seeds.length} builtin skills`);
}

let storeInitialized = false;

/** 初始化技能配置存储 */
export async function initSkillConfigStore(): Promise<void> {
  if (storeInitialized) return;
  await ensureTable();
  await seedBuiltinSkills();
  storeInitialized = true;
}

/** 列出所有技能配置 */
export async function listSkillConfigs(): Promise<SkillConfig[]> {
  await initSkillConfigStore();
  const db = getDbClient();
  const result = await db.execute(`SELECT config FROM ${TABLE_NAME} ORDER BY created_at ASC`);
  return result.rows.map(row => JSON.parse((row as any).config) as SkillConfig);
}

/** 获取单个技能配置 */
export async function getSkillConfig(id: string): Promise<SkillConfig | null> {
  await initSkillConfigStore();
  const db = getDbClient();
  const result = await db.execute({
    sql: `SELECT config FROM ${TABLE_NAME} WHERE id = ?`,
    args: [id],
  });
  if (result.rows.length === 0) return null;
  return JSON.parse((result.rows[0] as any).config) as SkillConfig;
}

/** 创建新技能配置 */
export async function createSkillConfig(
  input: CreateSkillConfigInput,
): Promise<SkillConfig> {
  await initSkillConfigStore();
  const db = getDbClient();
  const now = new Date().toISOString();
  const config: SkillConfig = {
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

/** 更新技能配置 */
export async function updateSkillConfig(
  id: string,
  updates: Partial<SkillConfig>,
): Promise<SkillConfig | null> {
  await initSkillConfigStore();
  const existing = await getSkillConfig(id);
  if (!existing) return null;

  const now = new Date().toISOString();
  const updated: SkillConfig = {
    ...existing,
    ...updates,
    id: existing.id,
    isBuiltin: existing.isBuiltin,
    createdAt: existing.createdAt,
    updatedAt: now,
  };

  const db = getDbClient();
  await db.execute({
    sql: `UPDATE ${TABLE_NAME} SET config = ?, updated_at = ? WHERE id = ?`,
    args: [JSON.stringify(updated), now, id],
  });

  return updated;
}

/** 删除技能配置（内置技能不可删除） */
export async function deleteSkillConfig(id: string): Promise<boolean> {
  await initSkillConfigStore();
  const existing = await getSkillConfig(id);
  if (!existing) return false;
  if (existing.isBuiltin) {
    throw new Error('Cannot delete builtin skill');
  }

  const db = getDbClient();
  const result = await db.execute({
    sql: `DELETE FROM ${TABLE_NAME} WHERE id = ?`,
    args: [id],
  });
  return (result.rowsAffected ?? 0) > 0;
}
