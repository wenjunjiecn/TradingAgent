import type { Client } from '@libsql/client';
import { Agent } from '@mastra/core/agent';
import { Memory } from '@mastra/memory';
import { LibSQLStore } from '@mastra/libsql';
import {
  type AgentConfig,
  type AgentTemplate,
} from '@trading-agent/shared';
import { getToolsByIds } from '../tools/tool-registry';
import { getEnabledToolIds } from '../tools/tool-config-store';
import { agentTemplates } from './agent-templates';
import { getDb, DB_URL } from '../db';
import { runMigrations } from '../db-migrations';
import { getSkillContent } from '../workspace-instance';

// ── 共享 Memory 存储 ──────────────────────────────────────────────────────
// 所有启用 memory 的 Agent 共用一个 LibSQLStore 实例，避免 N 个独立 DB 连接
// 到同一个 SQLite 文件带来的连接建立开销和 page cache 冗余。
let sharedMemoryStore: LibSQLStore | null = null;
function getSharedMemoryStore(): LibSQLStore {
  if (!sharedMemoryStore) {
    sharedMemoryStore = new LibSQLStore({
      id: 'shared-agent-memory',
      url: DB_URL,
    });
  }
  return sharedMemoryStore;
}

/**
 * Agent 注册中心
 *
 * 管理 Agent 配置的持久化存储和 Mastra Agent 实例的动态创建。
 * 使用 LibSQL 存储配置，启动时自动从模板种子化默认角色。
 */

const TABLE_NAME = 'agent_configs';

let storeInitialized = false;

function getDbClient(): Client {
  return getDb();
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
  'tpl-research-supervisor': 'research-supervisor',
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
    skillIds: [],
    memoryEnabled: true,
    metadata: template.metadata,
    isTemplate: false,
    subAgentIds: template.subAgentIds ? [...template.subAgentIds] : undefined,
    createdAt: now,
    updatedAt: now,
  };
}

/** 种子化：检查缺失的种子 agent 并批量插入（支持增量新增模板） */
async function seedDefaults(): Promise<void> {
  const db = getDbClient();

  // 获取当前所有已存在的种子 agent ID
  const seedIds = Object.values(SEED_AGENT_IDS);
  const placeholders = seedIds.map(() => '?').join(',');
  const result = await db.execute({
    sql: `SELECT id FROM ${TABLE_NAME} WHERE id IN (${placeholders})`,
    args: seedIds,
  });
  const existingIds = new Set(result.rows.map(r => (r as any).id));

  // 收集需要插入的配置
  const toInsert: Array<{ config: AgentConfig; now: string }> = [];
  for (const template of agentTemplates) {
    const config = configFromTemplate(template);
    if (existingIds.has(config.id)) continue;
    toInsert.push({ config, now: config.createdAt });
  }

  if (toInsert.length === 0) return;

  // 批量插入：单事务提交，避免 N 次串行 DB 往返
  await db.batch(toInsert.map(({ config, now }) => ({
    sql: `INSERT INTO ${TABLE_NAME} (id, config, created_at, updated_at, name, description, model) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    args: [config.id, JSON.stringify(config), now, now, config.name, config.description, config.model],
  })));
  console.log(`[AgentRegistry] Seeded ${toInsert.length} new agents in batch`);
}

/** 初始化注册中心（仅首次调用执行完整初始化） */
export async function initAgentRegistry(): Promise<void> {
  if (storeInitialized) return;
  await runMigrations();
  await seedDefaults();
  storeInitialized = true;
}

/** 列出所有 Agent 配置 */
export async function listAgentConfigs(): Promise<AgentConfig[]> {
  const db = getDbClient();
  const result = await db.execute(`SELECT config FROM ${TABLE_NAME} ORDER BY created_at ASC`);
  return result.rows.map(row => JSON.parse((row as any).config) as AgentConfig);
}

/** Agent 配置摘要（轻量，不含 instructions 等大字段） */
export interface AgentConfigSummary {
  id: string;
  name: string;
  description: string;
  model: string;
  metadata?: Record<string, unknown>;
}

/**
 * 列出所有 Agent 配置摘要（不读取 config JSON 正文）
 * 适用于列表/选择器场景，避免加载 8 份完整 instructions（可能数十 KB）。
 */
export async function listAgentConfigSummaries(): Promise<AgentConfigSummary[]> {
  const db = getDbClient();
  // 完全从 config JSON 中提取字段，不依赖迁移列（name/description/model）
  // 这样即使迁移列缺失也能正常工作
  const result = await db.execute({
    sql: `SELECT
      id,
      json_extract(config, '$.name') as name,
      json_extract(config, '$.description') as description,
      json_extract(config, '$.model') as model,
      json_extract(config, '$.metadata') as metadata
    FROM ${TABLE_NAME} ORDER BY created_at ASC`,
  });
  return result.rows.map(row => ({
    id: (row as any).id,
    name: (row as any).name ?? '',
    description: (row as any).description ?? '',
    model: (row as any).model ?? '',
    metadata: (row as any).metadata ? JSON.parse((row as any).metadata) : undefined,
  }));
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
    sql: `INSERT INTO ${TABLE_NAME} (id, config, created_at, updated_at, name, description, model) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    args: [fullConfig.id, JSON.stringify(fullConfig), now, now, fullConfig.name ?? null, fullConfig.description ?? null, fullConfig.model ?? null],
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
    sql: `UPDATE ${TABLE_NAME} SET config = ?, updated_at = ?, name = ?, description = ?, model = ? WHERE id = ?`,
    args: [JSON.stringify(updated), now, updated.name ?? null, updated.description ?? null, updated.model ?? null, id],
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
    skillIds: [],
    memoryEnabled: true,
    metadata: template.metadata,
    subAgentIds: template.subAgentIds ? [...template.subAgentIds] : undefined,
  });
}

/**
 * 将 AgentConfig 实例化为 Mastra Agent 对象
 *
 * 动态绑定 tools、model、instructions 和 memory。
 * 如果传入 subAgents，则作为 supervisor agent 的子 agent 注入。
 */
export async function instantiateAgent(config: AgentConfig, subAgents?: Record<string, Agent>): Promise<Agent> {
  // 获取已启用的工具 ID 集合，过滤掉被禁用的工具
  const enabledToolIds = await getEnabledToolIds();
  const activeToolIds = config.toolIds.filter(id => enabledToolIds.has(id));

  if (activeToolIds.length < config.toolIds.length) {
    const disabled = config.toolIds.filter(id => !enabledToolIds.has(id));
    console.warn(
      `[AgentRegistry] Agent "${config.id}" has disabled tools: ${disabled.join(', ')}`,
    );
  }

  const tools = await getToolsByIds(activeToolIds);

  // 加载 Skill 内容并注入到 instructions
  let instructions = config.instructions;
  const loadedSkillIds: string[] = [];
  if (config.skillIds && config.skillIds.length > 0) {
    const skillParts: string[] = [];
    for (const skillId of config.skillIds) {
      const skillContent = await getSkillContent(skillId);
      if (skillContent) {
        skillParts.push(`## Skill: ${skillId}\n${skillContent}`);
        loadedSkillIds.push(skillId);
      } else {
        console.warn(`[AgentRegistry] Skill "${skillId}" not found for agent "${config.id}"`);
      }
    }
    if (skillParts.length > 0) {
      instructions = `${config.instructions}\n\n--- Loaded Skills ---\n${skillParts.join('\n\n')}`;
    }
  }

  const agentOptions: Record<string, unknown> = {
    id: config.id,
    name: config.name,
    description: config.description,
    instructions,
    model: config.model,
    tools,
  };

  if (config.memoryEnabled) {
    agentOptions.memory = new Memory({
      storage: getSharedMemoryStore(),
    });
  }

  if (config.metadata) {
    agentOptions.metadata = {
      ...config.metadata,
      // 记录已加载的 Skill ID 列表，供 Trace 和运行详情确认
      ...(loadedSkillIds.length > 0 ? { loadedSkillIds } : {}),
    };
  } else if (loadedSkillIds.length > 0) {
    agentOptions.metadata = { loadedSkillIds } as any;
  }

  // 注入子 agent（supervisor 模式）
  if (subAgents && Object.keys(subAgents).length > 0) {
    agentOptions.agents = subAgents;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new Agent(agentOptions as any) as any;
}

/**
 * 加载所有 Agent 配置并实例化为 Mastra Agent 对象
 *
 * 返回一个 record，key 为 agent ID，value 为 Agent 实例。
 * 支持 subAgentIds：先实例化所有普通 agent，再给 supervisor 注入子 agent 引用。
 */
export async function loadAllAgents(): Promise<Record<string, any>> {
  await initAgentRegistry();
  const configs = await listAgentConfigs();
  const agents: Record<string, Agent> = {};

  // 第一轮：实例化所有 agent（不注入子 agent）
  for (const config of configs) {
    try {
      agents[config.id] = await instantiateAgent(config);
    } catch (error) {
      console.error(`[AgentRegistry] Failed to instantiate agent "${config.id}":`, error);
    }
  }

  // 第二轮：为有 subAgentIds 的 agent 注入子 agent 引用
  for (const config of configs) {
    if (config.subAgentIds && config.subAgentIds.length > 0 && agents[config.id]) {
      const subAgents: Record<string, Agent> = {};
      for (const subId of config.subAgentIds) {
        if (agents[subId]) {
          subAgents[subId] = agents[subId];
        } else {
          console.warn(`[AgentRegistry] Sub-agent "${subId}" not found for supervisor "${config.id}"`);
        }
      }
      // 重新实例化 supervisor，注入子 agent
      try {
        agents[config.id] = await instantiateAgent(config, subAgents);
      } catch (error) {
        console.error(`[AgentRegistry] Failed to re-instantiate supervisor "${config.id}":`, error);
      }
    }
  }

  return agents;
}
