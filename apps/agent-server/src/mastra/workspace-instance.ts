import type { Workspace } from '@mastra/core/workspace';

/**
 * Workspace 实例持有者
 *
 * 将 Workspace 实例从 index.ts 中解耦，
 * 使 agent-runtime-registry 和 agent-registry 能够访问 Workspace Skill。
 *
 * 在 index.ts 中通过 setWorkspace() 设置实例。
 */

let workspaceInstance: Workspace | null = null;

/** 设置 Workspace 实例（在 index.ts 启动时调用） */
export function setWorkspace(ws: Workspace): void {
  workspaceInstance = ws;
}

/** 获取 Workspace 实例 */
export function getWorkspace(): Workspace | null {
  return workspaceInstance;
}

/**
 * 获取 Skill 内容
 *
 * 通过 Workspace 加载 Skill 内容，用于注入到 Agent 的 instructions 中。
 * 如果 Workspace 未初始化或 Skill 不存在，返回 null。
 */
export async function getSkillContent(skillId: string): Promise<string | null> {
  if (!workspaceInstance) {
    console.warn('[WorkspaceInstance] Workspace not initialized');
    return null;
  }

  try {
    // 尝试通过 Workspace API 获取 Skill
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ws = workspaceInstance as any;
    
    // Mastra Workspace API: getSkill(skillId) 返回 Skill 对象
    if (typeof ws.getSkill === 'function') {
      const skill = await ws.getSkill(skillId);
      if (skill) {
        // Skill 对象可能包含 content 或 instructions 字段
        return skill.content ?? skill.instructions ?? skill.description ?? null;
      }
    }

    // 备用: listSkills() 然后查找
    if (typeof ws.listSkills === 'function') {
      const skills = await ws.listSkills();
      const skill = skills?.find((s: any) => s.id === skillId || s.name === skillId);
      if (skill) {
        return skill.content ?? skill.instructions ?? skill.description ?? null;
      }
    }

    return null;
  } catch (error) {
    console.warn(`[WorkspaceInstance] Failed to load skill "${skillId}":`, error);
    return null;
  }
}
