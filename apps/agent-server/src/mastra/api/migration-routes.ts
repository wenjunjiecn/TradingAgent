import type { ApiRoute } from '@mastra/core/server';
import { createBackup, listBackups, loadBackup, type MigrationBackup } from '../migrations/backup';
import {
  previewAgentMigration,
  executeAgentMigration,
  rollbackAgentMigration,
} from '../migrations/agent-migrator';
import {
  previewSkillMigration,
  executeSkillMigration,
  rollbackSkillMigration,
} from '../migrations/skill-migrator';

/**
 * 迁移管理 REST API 路由
 *
 * 提供 Agent 和 Skill 配置迁移的状态检测、预览、执行和回滚功能。
 * 所有路由以 /api 为前缀（Mastra 默认 apiPrefix）。
 */

// ── 迁移状态检测 ──────────────────────────────────────────────────────

const migrationStatusRoute: ApiRoute = {
  path: '/research/migrations/status',
  method: 'GET',
  handler: async (c: any) => {
    const [agentPreview, skillPreview] = await Promise.all([
      previewAgentMigration(),
      previewSkillMigration(),
    ]);

    const backups = listBackups();

    return c.json({
      agents: {
        total: agentPreview.totalAgents,
        ready: agentPreview.ready.length,
        conflicts: agentPreview.conflicts.length,
        skipped: agentPreview.skipped.length,
      },
      skills: {
        total: skillPreview.totalSkills,
        ready: skillPreview.ready.length,
        conflicts: skillPreview.conflicts.length,
      },
      backups: backups.length,
      lastBackup: backups[0]?.timestamp ?? null,
    });
  },
};

// ── 迁移预览 ──────────────────────────────────────────────────────────

const migrationPreviewRoute: ApiRoute = {
  path: '/research/migrations/preview',
  method: 'POST',
  handler: async (c: any) => {
    const [agentPreview, skillPreview] = await Promise.all([
      previewAgentMigration(),
      previewSkillMigration(),
    ]);

    return c.json({
      agents: agentPreview,
      skills: skillPreview,
    });
  },
};

// ── 执行迁移 ──────────────────────────────────────────────────────────

const migrationExecuteRoute: ApiRoute = {
  path: '/research/migrations/execute',
  method: 'POST',
  handler: async (c: any) => {
    try {
      const body = await c.req.json().catch(() => ({}));
      const conflictStrategy = body.conflictStrategy ?? 'skip';

      // 1. 创建备份
      const backup = await createBackup();

      // 2. 执行 Agent 迁移
      const agentResult = await executeAgentMigration(conflictStrategy, {
        timestamp: backup.timestamp,
        agents: [],
        skills: [],
        version: '1.0.0',
      });

      // 3. 执行 Skill 迁移
      const skillResult = await executeSkillMigration(conflictStrategy);

      return c.json({
        backup: { path: backup.path, timestamp: backup.timestamp },
        agents: agentResult,
        skills: skillResult,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return c.json({ error: message }, 500);
    }
  },
};

// ── 回滚 ──────────────────────────────────────────────────────────────

const migrationRollbackRoute: ApiRoute = {
  path: '/research/migrations/rollback',
  method: 'POST',
  handler: async (c: any) => {
    try {
      const body = await c.req.json().catch(() => ({}));
      const timestamp = body.timestamp;

      if (!timestamp) {
        return c.json({ error: 'Backup timestamp is required' }, 400);
      }

      const backup: MigrationBackup | null = loadBackup(timestamp);
      if (!backup) {
        return c.json({ error: 'Backup not found' }, 404);
      }

      // 回滚 Agent 迁移
      const agentRollback = await rollbackAgentMigration(backup);

      // 回滚 Skill 迁移
      const skillRollback = await rollbackSkillMigration(backup);

      return c.json({
        agents: agentRollback,
        skills: skillRollback,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return c.json({ error: message }, 500);
    }
  },
};

// ── 列出备份 ──────────────────────────────────────────────────────────

const migrationBackupsRoute: ApiRoute = {
  path: '/research/migrations/backups',
  method: 'GET',
  handler: async (c: any) => {
    const backups = listBackups();
    return c.json({ backups });
  },
};

// ── 导出所有迁移路由 ──────────────────────────────────────────────────

export const migrationRoutes: ApiRoute[] = [
  migrationStatusRoute,
  migrationPreviewRoute,
  migrationExecuteRoute,
  migrationRollbackRoute,
  migrationBackupsRoute,
];
