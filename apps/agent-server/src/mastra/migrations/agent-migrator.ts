import type { AgentConfig } from '@trading-agent/shared';
import { listAgentConfigs, getAgentConfig, createAgentConfig, deleteAgentConfig } from '../agents/agent-registry';
import { agentRuntimeRegistry } from '../agents/agent-runtime-registry';
import type { MigrationBackup } from './backup';

/**
 * Agent 配置迁移器
 *
 * 将 agent_configs 中的旧数据迁移/同步到统一目录。
 * 当前实现: agent_configs 已是运行时数据源，迁移主要做数据校验和清理。
 * 未来: 将 agent_configs 迁移到 Mastra Stored Agent (Editor DB)。
 */

/** 迁移预览结果 */
export interface AgentMigrationPreview {
  totalAgents: number;
  conflicts: Array<{
    agentId: string;
    agentName: string;
    conflictType: 'duplicate-id' | 'missing-field';
    details: string;
  }>;
  skipped: Array<{ agentId: string; reason: string }>;
  ready: Array<{ agentId: string; agentName: string }>;
}

/** 迁移执行结果 */
export interface AgentMigrationResult {
  migrated: Array<{ agentId: string; agentName: string; status: 'success' | 'skipped' | 'error'; message?: string }>;
  totalSuccess: number;
  totalSkipped: number;
  totalErrors: number;
}

/**
 * 生成迁移预览
 *
 * 检查所有 agent_configs，识别冲突和需要迁移的条目。
 */
export async function previewAgentMigration(): Promise<AgentMigrationPreview> {
  const configs = await listAgentConfigs();
  const seen = new Set<string>();
  const conflicts: AgentMigrationPreview['conflicts'] = [];
  const skipped: AgentMigrationPreview['skipped'] = [];
  const ready: AgentMigrationPreview['ready'] = [];

  for (const config of configs) {
    // 检查 ID 重复
    if (seen.has(config.id)) {
      conflicts.push({
        agentId: config.id,
        agentName: config.name,
        conflictType: 'duplicate-id',
        details: `Duplicate ID: ${config.id}`,
      });
      continue;
    }
    seen.add(config.id);

    // 检查必要字段
    if (!config.name || !config.instructions || !config.model) {
      skipped.push({
        agentId: config.id,
        reason: 'Missing required fields (name, instructions, or model)',
      });
      continue;
    }

    ready.push({
      agentId: config.id,
      agentName: config.name,
    });
  }

  return {
    totalAgents: configs.length,
    conflicts,
    skipped,
    ready,
  };
}

/**
 * 执行 Agent 迁移
 *
 * @param conflictStrategy 冲突处理策略: 'overwrite' | 'skip' | 'new-id'
 * @param backup 迁移前的备份（用于回滚）
 */
export async function executeAgentMigration(
  conflictStrategy: 'overwrite' | 'skip' | 'new-id' = 'skip',
  _backup?: MigrationBackup,
): Promise<AgentMigrationResult> {
  const preview = await previewAgentMigration();
  const results: AgentMigrationResult['migrated'] = [];
  let totalSuccess = 0;
  let totalSkipped = 0;
  let totalErrors = 0;

  // 当前 agent_configs 已是运行时数据源，迁移主要是确保数据一致性
  // 这里我们验证每个配置是否完整，并确保 skillIds 字段存在
  for (const item of preview.ready) {
    try {
      const config = await getAgentConfig(item.agentId);
      if (!config) {
        results.push({
          agentId: item.agentId,
          agentName: item.agentName,
          status: 'error',
          message: 'Config not found',
        });
        totalErrors++;
        continue;
      }

      // 确保 skillIds 字段存在（旧数据可能没有）
      if (!config.skillIds) {
        await import('../agents/agent-registry').then(({ updateAgentConfig }) =>
          updateAgentConfig(item.agentId, { skillIds: [] }),
        );
      }

      results.push({
        agentId: item.agentId,
        agentName: item.agentName,
        status: 'success',
      });
      totalSuccess++;
    } catch (error) {
      results.push({
        agentId: item.agentId,
        agentName: item.agentName,
        status: 'error',
        message: error instanceof Error ? error.message : String(error),
      });
      totalErrors++;
    }
  }

  // 跳过冲突和缺失字段的条目
  totalSkipped = preview.conflicts.length + preview.skipped.length;
  for (const c of preview.conflicts) {
    results.push({
      agentId: c.agentId,
      agentName: c.agentName,
      status: 'skipped',
      message: c.details,
    });
  }
  for (const s of preview.skipped) {
    results.push({
      agentId: s.agentId,
      agentName: s.agentId,
      status: 'skipped',
      message: s.reason,
    });
  }

  // 失效缓存
  agentRuntimeRegistry.invalidateAll();

  return { migrated: results, totalSuccess, totalSkipped, totalErrors };
}

/**
 * 回滚 Agent 迁移
 *
 * 从备份恢复 agent_configs 数据。
 * 当前实现: 由于 agent_configs 是唯一数据源，回滚意味着恢复备份中的数据。
 */
export async function rollbackAgentMigration(backup: MigrationBackup): Promise<{ restored: number; errors: number }> {
  let restored = 0;
  let errors = 0;

  // 先清空当前所有 agent_configs
  const currentConfigs = await listAgentConfigs();
  for (const config of currentConfigs) {
    try {
      await deleteAgentConfig(config.id);
    } catch {
      // 忽略删除错误
    }
  }

  // 从备份恢复
  for (const agent of backup.agents) {
    try {
      await createAgentConfig({
        id: agent.id,
        name: agent.name,
        description: agent.description,
        instructions: agent.instructions,
        model: agent.model,
        toolIds: agent.toolIds,
        skillIds: agent.skillIds ?? [],
        memoryEnabled: agent.memoryEnabled,
        metadata: agent.metadata,
        subAgentIds: agent.subAgentIds,
      });
      restored++;
    } catch (error) {
      console.error(`[AgentMigrator] Failed to restore agent "${agent.id}":`, error);
      errors++;
    }
  }

  // 失效缓存
  agentRuntimeRegistry.invalidateAll();

  return { restored, errors };
}
