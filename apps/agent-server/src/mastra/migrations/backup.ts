import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { listAgentConfigs } from '../agents/agent-registry';
import { listSkillConfigs } from '../tools/skill-config-store';
import type { AgentConfig } from '@trading-agent/shared';

/**
 * 迁移备份工具
 *
 * 迁移前将 agent_configs 和 skill_configs 表导出为 JSON 文件，
 * 存入 ~/.trading-agent/backups/ 目录。
 * 回滚时从备份文件恢复旧表数据。
 */

const BACKUP_DIR = join(homedir(), '.trading-agent', 'backups');

/** 备份内容 */
export interface MigrationBackup {
  timestamp: string;
  agents: AgentConfig[];
  skills: any[];
  version: string;
}

/** 确保备份目录存在 */
function ensureBackupDir(): void {
  if (!existsSync(BACKUP_DIR)) {
    mkdirSync(BACKUP_DIR, { recursive: true });
  }
}

/**
 * 创建备份
 *
 * 导出 agent_configs 和 skill_configs 表为 JSON 文件。
 * 文件名格式: migration-backup-{timestamp}.json
 */
export async function createBackup(): Promise<{ path: string; timestamp: string }> {
  ensureBackupDir();
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = join(BACKUP_DIR, `migration-backup-${timestamp}.json`);

  const [agents, skills] = await Promise.all([
    listAgentConfigs(),
    listSkillConfigs(),
  ]);

  const backup: MigrationBackup = {
    timestamp,
    agents,
    skills,
    version: '1.0.0',
  };

  writeFileSync(backupPath, JSON.stringify(backup, null, 2));
  console.log(`[MigrationBackup] Created backup at ${backupPath} (${agents.length} agents, ${skills.length} skills)`);

  return { path: backupPath, timestamp };
}

/**
 * 列出所有可用的备份
 */
export function listBackups(): Array<{ timestamp: string; path: string; agentCount: number; skillCount: number }> {
  if (!existsSync(BACKUP_DIR)) return [];

  const { readdirSync } = require('node:fs');
  const files = readdirSync(BACKUP_DIR) as string[];
  const backups: Array<{ timestamp: string; path: string; agentCount: number; skillCount: number }> = [];

  for (const file of files) {
    if (!file.startsWith('migration-backup-') || !file.endsWith('.json')) continue;
    const filePath = join(BACKUP_DIR, file);
    try {
      const content = readFileSync(filePath, 'utf-8');
      const backup: MigrationBackup = JSON.parse(content);
      backups.push({
        timestamp: backup.timestamp,
        path: filePath,
        agentCount: backup.agents.length,
        skillCount: backup.skills.length,
      });
    } catch {
      // 跳过损坏的备份文件
    }
  }

  return backups.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}

/**
 * 加载指定备份
 */
export function loadBackup(timestamp: string): MigrationBackup | null {
  const backupPath = join(BACKUP_DIR, `migration-backup-${timestamp}.json`);
  if (!existsSync(backupPath)) return null;

  try {
    const content = readFileSync(backupPath, 'utf-8');
    return JSON.parse(content) as MigrationBackup;
  } catch {
    return null;
  }
}
