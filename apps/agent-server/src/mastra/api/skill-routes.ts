import type { ApiRoute } from '@mastra/core/server';
import {
  listSkillConfigs,
  getSkillConfig,
  createSkillConfig,
  updateSkillConfig,
  deleteSkillConfig,
} from '../tools/skill-config-store';

/**
 * 技能配置 REST API 路由
 *
 * 暴露技能配置的 CRUD 端点，供前端 Desktop 应用调用。
 * 所有路由以 /api 为前缀（Mastra 默认 apiPrefix）。
 */

// ── Skill 配置 CRUD 路由 ──────────────────────────────────────────────

const listSkillsRoute: ApiRoute = {
  path: '/research/skills',
  method: 'GET',
  handler: async (c: any) => {
    const skills = await listSkillConfigs();
    return c.json({ skills });
  },
};

const getSkillRoute: ApiRoute = {
  path: '/research/skills/:id',
  method: 'GET',
  handler: async (c: any) => {
    const id = c.req.param('id');
    const skill = await getSkillConfig(id);
    if (!skill) {
      return c.json({ error: 'Skill not found' }, 404);
    }
    return c.json({ skill });
  },
};

const createSkillRoute: ApiRoute = {
  path: '/research/skills',
  method: 'POST',
  handler: async (c: any) => {
    try {
      const body = await c.req.json();
      const skill = await createSkillConfig(body);
      return c.json({ skill }, 201);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return c.json({ error: message }, 500);
    }
  },
};

const updateSkillRoute: ApiRoute = {
  path: '/research/skills/:id',
  method: 'PUT',
  handler: async (c: any) => {
    try {
      const id = c.req.param('id');
      const updates = await c.req.json();
      const skill = await updateSkillConfig(id, updates);
      if (!skill) {
        return c.json({ error: 'Skill not found' }, 404);
      }
      return c.json({ skill });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return c.json({ error: message }, 500);
    }
  },
};

const deleteSkillRoute: ApiRoute = {
  path: '/research/skills/:id',
  method: 'DELETE',
  handler: async (c: any) => {
    const id = c.req.param('id');
    try {
      const deleted = await deleteSkillConfig(id);
      if (!deleted) {
        return c.json({ error: 'Skill not found' }, 404);
      }
      return c.json({ success: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return c.json({ error: message }, 400);
    }
  },
};

// ── 导出所有 Skill 路由 ───────────────────────────────────────────────

export const skillRoutes: ApiRoute[] = [
  listSkillsRoute,
  getSkillRoute,
  createSkillRoute,
  updateSkillRoute,
  deleteSkillRoute,
];
