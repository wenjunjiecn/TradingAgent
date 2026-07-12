import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { listSkillConfigs } from '../tools/skill-config-store';
import { findProjectRoot } from '../db';
import type { MigrationBackup } from './backup';

/**
 * Skill 配置迁移器
 *
 * 将 skill_configs DB 表中的 Skill 迁移到 Workspace Skill
 * (skills/ 目录中的 SKILL.md 文件)。
 *
 * Workspace 通过 LocalSkillSource 自动发现 skills/ 目录中的 SKILL.md 文件。
 */

/** Skill 迁移预览 */
export interface SkillMigrationPreview {
  totalSkills: number;
  conflicts: Array<{
    skillId: string;
    skillName: string;
    conflictType: 'file-exists';
    details: string;
  }>;
  ready: Array<{ skillId: string; skillName: string }>;
}

/** Skill 迁移结果 */
export interface SkillMigrationResult {
  migrated: Array<{ skillId: string; skillName: string; status: 'success' | 'skipped' | 'error'; message?: string }>;
  totalSuccess: number;
  totalSkipped: number;
  totalErrors: number;
}

/**
 * 生成 SKILL.md 文件内容
 *
 * Mastra Workspace Skill 格式: frontmatter + body
 */
function generateSkillFile(skill: any): string {
  const frontmatter: Record<string, any> = {
    name: skill.name ?? skill.id,
    description: skill.description ?? '',
  };

  // 添加 triggers（如有）
  if (skill.triggers && Array.isArray(skill.triggers) && skill.triggers.length > 0) {
    frontmatter.triggers = skill.triggers;
  }

  // 添加 category（如有）
  if (skill.category) {
    frontmatter.category = skill.category;
  }

  // 生成 frontmatter
  const frontmatterStr = Object.entries(frontmatter)
    .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
    .join('\n');

  // body: skill 的 content 或 description
  const body = skill.content ?? skill.description ?? '';

  return `---\n${frontmatterStr}\n---\n\n${body}\n`;
}

/**
 * 获取 skills 目录路径
 */
function getSkillsDir(): string {
  const projectRoot = findProjectRoot(process.env.INIT_CWD ?? process.cwd());
  return join(projectRoot, 'skills');
}

/**
 * 生成迁移预览
 */
export async function previewSkillMigration(): Promise<SkillMigrationPreview> {
  const skills = await listSkillConfigs();
  const skillsDir = getSkillsDir();
  const conflicts: SkillMigrationPreview['conflicts'] = [];
  const ready: SkillMigrationPreview['ready'] = [];

  for (const skill of skills) {
    const skillPath = join(skillsDir, skill.id, 'SKILL.md');
    if (existsSync(skillPath)) {
      conflicts.push({
        skillId: skill.id,
        skillName: skill.name ?? skill.id,
        conflictType: 'file-exists',
        details: `SKILL.md already exists at ${skillPath}`,
      });
    } else {
      ready.push({
        skillId: skill.id,
        skillName: skill.name ?? skill.id,
      });
    }
  }

  return {
    totalSkills: skills.length,
    conflicts,
    ready,
  };
}

/**
 * 执行 Skill 迁移
 *
 * 将 skill_configs 中的 Skill 写入 skills/ 目录作为 SKILL.md 文件。
 * Workspace 会自动发现这些文件。
 *
 * @param conflictStrategy 冲突处理策略: 'overwrite' | 'skip'
 */
export async function executeSkillMigration(
  conflictStrategy: 'overwrite' | 'skip' = 'skip',
): Promise<SkillMigrationResult> {
  const preview = await previewSkillMigration();
  const skillsDir = getSkillsDir();
  const results: SkillMigrationResult['migrated'] = [];
  let totalSuccess = 0;
  let totalSkipped = 0;
  let totalErrors = 0;

  // 处理 ready 列表
  for (const item of preview.ready) {
    try {
      const skills = await listSkillConfigs();
      const skill = skills.find(s => s.id === item.skillId);
      if (!skill) {
        results.push({
          skillId: item.skillId,
          skillName: item.skillName,
          status: 'error',
          message: 'Skill config not found',
        });
        totalErrors++;
        continue;
      }

      // 创建 skill 目录
      const skillDir = join(skillsDir, skill.id);
      if (!existsSync(skillDir)) {
        mkdirSync(skillDir, { recursive: true });
      }

      // 写入 SKILL.md
      const skillContent = generateSkillFile(skill);
      const skillPath = join(skillDir, 'SKILL.md');
      writeFileSync(skillPath, skillContent);

      results.push({
        skillId: item.skillId,
        skillName: item.skillName,
        status: 'success',
      });
      totalSuccess++;
    } catch (error) {
      results.push({
        skillId: item.skillId,
        skillName: item.skillName,
        status: 'error',
        message: error instanceof Error ? error.message : String(error),
      });
      totalErrors++;
    }
  }

  // 处理冲突
  for (const c of preview.conflicts) {
    if (conflictStrategy === 'overwrite') {
      try {
        const skills = await listSkillConfigs();
        const skill = skills.find(s => s.id === c.skillId);
        if (!skill) continue;

        const skillDir = join(skillsDir, skill.id);
        if (!existsSync(skillDir)) {
          mkdirSync(skillDir, { recursive: true });
        }

        const skillContent = generateSkillFile(skill);
        writeFileSync(join(skillDir, 'SKILL.md'), skillContent);

        results.push({
          skillId: c.skillId,
          skillName: c.skillName,
          status: 'success',
          message: 'Overwritten',
        });
        totalSuccess++;
      } catch (error) {
        results.push({
          skillId: c.skillId,
          skillName: c.skillName,
          status: 'error',
          message: error instanceof Error ? error.message : String(error),
        });
        totalErrors++;
      }
    } else {
      results.push({
        skillId: c.skillId,
        skillName: c.skillName,
        status: 'skipped',
        message: c.details,
      });
      totalSkipped++;
    }
  }

  return { migrated: results, totalSuccess, totalSkipped, totalErrors };
}

/**
 * 回滚 Skill 迁移
 *
 * 删除迁移产生的 SKILL.md 文件。
 * 从备份中恢复 skill_configs 数据（skill_configs 表本身未被修改，无需恢复）。
 */
export async function rollbackSkillMigration(backup: MigrationBackup): Promise<{ deleted: number; errors: number }> {
  const { rmSync, existsSync: exists } = await import('node:fs');
  const skillsDir = getSkillsDir();
  let deleted = 0;
  let errors = 0;

  for (const skill of backup.skills) {
    const skillDir = join(skillsDir, skill.id);
    if (exists(skillDir)) {
      try {
        rmSync(skillDir, { recursive: true });
        deleted++;
      } catch (error) {
        console.error(`[SkillMigrator] Failed to delete skill directory "${skill.id}":`, error);
        errors++;
      }
    }
  }

  return { deleted, errors };
}
