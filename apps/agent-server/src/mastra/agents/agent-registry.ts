import { createClient, type Client } from '@libsql/client';
import { Agent } from '@mastra/core/agent';
import { Memory } from '@mastra/memory';
import { LibSQLStore } from '@mastra/libsql';
import {
  type AgentConfig,
  type AgentTemplate,
} from '@trading-agent/shared';
import { getToolsByIds } from '../tools/tool-registry';
import { agentTemplates } from './agent-templates';

/**
 * Agent 注册中心
 *
 * 管理 Agent 配置的持久化存储和 Mastra Agent 实例的动态创建。
 * 使用 LibSQL 存储配置，启动时自动从模板种子化默认角色。
 */

const DB_URL = 'file:./mastra.db';
const TABLE_NAME = 'agent_configs';

let dbClient: Client | null = null;

function getDbClient(): Client {
  if (!dbClient) {
    dbClient = createClient({ url: DB_URL });
  }
  return dbClient;
}

/** 确保 agent_configs 表存在 */
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

/** 种子 agent ID 映射 — 模板 ID → agent ID（与 workflow 中的 getAgent() 调用对应） */
const SEED_AGENT_IDS: Record<string, string> = {
  'tpl-technical-analyst': 'trading-agent',
  'tpl-market-structure': 'market-analysis-agent',
  'tpl-sentiment': 'sentiment-analysis-agent',
  'tpl-risk-analyst': 'risk-analysis-agent',
  'tpl-value-investor': 'value-investor',
  'tpl-growth-analyst': 'growth-analyst',
  'tpl-macro-analyst': 'macro-analyst',
  'tpl-quant-analyst': 'quant-analyst',
};

/** 从模板创建 AgentConfig */
function configFromTemplate(template: AgentTemplate): AgentConfig {
  const now = new Date().toISOString();
  return {
    id: SEED_AGENT_IDS[template.id] ?? template.id.replace('tpl-', 'agent-'),
    name: template.name,
    description: template.description,
    instructions: template.instructions,
    model: template.model,
    toolIds: [...template.toolIds],
    memoryEnabled: true,
    metadata: template.metadata,
    isTemplate: false,
    createdAt: now,
    updatedAt: now,
  };
}

/** 种子化：如果表中无数据，从模板插入默认角色 */
async function seedDefaults(): Promise<void> {
  const db = getDbClient();
  const result = await db.execute(`SELECT COUNT(*) as count FROM ${TABLE_NAME}`);
  const count = (result.rows[0] as any)?.count ?? 0;
  if (Number(count) > 0) return;

  for (const template of agentTemplates) {
    const config = configFromTemplate(template);
    const now = new Date().toISOString();
    await db.execute({
      sql: `INSERT INTO ${TABLE_NAME} (id, config, created_at, updated_at) VALUES (?, ?, ?, ?)`,
      args: [config.id, JSON.stringify(config), now, now],
    });
  }
}

/** 初始化注册中心 */
export async function initAgentRegistry(): Promise<void> {
  await ensureTable();
  await seedDefaults();
}

/** 列出所有 Agent 配置 */
export async function listAgentConfigs(): Promise<AgentConfig[]> {
  const db = getDbClient();
  const result = await db.execute(`SELECT config FROM ${TABLE_NAME} ORDER BY created_at ASC`);
  return result.rows.map(row => JSON.parse((row as any).config) as AgentConfig);
}

/** 获取单个 Agent 配置 */
export async function getAgentConfig(id: string): Promise<AgentConfig | null> {
  const db = getDbClient();
  const result = await db.execute({
    sql: `SELECT config FROM ${TABLE_NAME} WHERE id = ?`,
    args: [id],
  });
  if (result.rows.length === 0) return null;
  return JSON.parse((result.rows[0] as any).config) as AgentConfig;
}

/** 创建新 Agent 配置 */
export async function createAgentConfig(config: Omit<AgentConfig, 'createdAt' | 'updatedAt' | 'isTemplate'>): Promise<AgentConfig> {
  const db = getDbClient();
  const now = new Date().toISOString();
  const fullConfig: AgentConfig = {
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

/** 更新 Agent 配置 */
export async function updateAgentConfig(id: string, updates: Partial<AgentConfig>): Promise<AgentConfig | null> {
  const existing = await getAgentConfig(id);
  if (!existing) return null;

  const now = new Date().toISOString();
  const updated: AgentConfig = {
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

/** 删除 Agent 配置 */
export async function deleteAgentConfig(id: string): Promise<boolean> {
  const db = getDbClient();
  const result = await db.execute({
    sql: `DELETE FROM ${TABLE_NAME} WHERE id = ?`,
    args: [id],
  });
  return (result.rowsAffected ?? 0) > 0;
}

/** 从模板创建新 Agent */
export async function createAgentFromTemplate(
  templateId: string,
  customName?: string,
): Promise<AgentConfig | null> {
  const template = agentTemplates.find(t => t.id === templateId);
  if (!template) return null;

  // 生成唯一 ID
  const suffix = Date.now().toString(36).slice(-6);
  const id = `${template.id.replace('tpl-', 'agent-')}-${suffix}`;

  return createAgentConfig({
    id,
    name: customName ?? template.name,
    description: template.description,
    instructions: template.instructions,
    model: template.model,
    toolIds: [...template.toolIds],
    memoryEnabled: true,
    metadata: template.metadata,
  });
}

/**
 * 将 AgentConfig 实例化为 Mastra Agent 对象
 *
 * 动态绑定 tools、model、instructions 和 memory。
 */
export function instantiateAgent(config: AgentConfig): Agent {
  const tools = getToolsByIds(config.toolIds);

  const agentOptions: Record<string, unknown> = {
    id: config.id,
    name: config.name,
    description: config.description,
    instructions: config.instructions,
    model: config.model,
    tools,
  };

  if (config.memoryEnabled) {
    agentOptions.memory = new Memory({
      storage: new LibSQLStore({
        id: `memory-${config.id}`,
        url: DB_URL,
      }),
    });
  }

  if (config.metadata) {
    agentOptions.metadata = config.metadata;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new Agent(agentOptions as any) as any;
}

/**
 * 加载所有 Agent 配置并实例化为 Mastra Agent 对象
 *
 * 返回一个 record，key 为 agent ID，value 为 Agent 实例。
 */
export async function loadAllAgents(): Promise<Record<string, any>> {
  await initAgentRegistry();
  const configs = await listAgentConfigs();
  const agents: Record<string, Agent> = {};

  for (const config of configs) {
    try {
      agents[config.id] = instantiateAgent(config);
    } catch (error) {
      console.error(`[AgentRegistry] Failed to instantiate agent "${config.id}":`, error);
    }
  }

  return agents;
}
