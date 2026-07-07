import type { ApiRoute } from '@mastra/core/server';
import {
  listTeamConfigs,
  getTeamConfig,
  createTeamConfig,
  updateTeamConfig,
  deleteTeamConfig,
  createTeamFromTemplate,
} from '../teams/team-config-store';
import { agentTeamTemplates } from '../teams/team-templates';
import { clearTeamSharedMemory } from '../teams/team-shared-memory';
import { executeTeamTask } from '../teams/team-execution-engine';
import type { AgentTeamConfig } from '@trading-agent/shared';

/**
 * Agent Team REST API 路由
 *
 * 暴露 Team 管理 + 执行端点，供前端 Desktop 应用调用。
 * 所有路由以 /api 为前缀（Mastra 默认 apiPrefix）。
 */

// ── Team 配置 CRUD 路由 ──────────────────────────────────────────────

const listTeamsRoute: ApiRoute = {
  path: '/research/teams',
  method: 'GET',
  handler: async (c: any) => {
    const teams = await listTeamConfigs();
    return c.json({ teams });
  },
};

const getTeamRoute: ApiRoute = {
  path: '/research/teams/:id',
  method: 'GET',
  handler: async (c: any) => {
    const id = c.req.param('id');
    const team = await getTeamConfig(id);
    if (!team) {
      return c.json({ error: 'Team not found' }, 404);
    }
    return c.json({ team });
  },
};

const createTeamRoute: ApiRoute = {
  path: '/research/teams',
  method: 'POST',
  handler: async (c: any) => {
    try {
      const body = await c.req.json();
      const team = await createTeamConfig(body);
      return c.json({ team }, 201);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return c.json({ error: message }, 500);
    }
  },
};

const updateTeamRoute: ApiRoute = {
  path: '/research/teams/:id',
  method: 'PUT',
  handler: async (c: any) => {
    try {
      const id = c.req.param('id');
      const updates = await c.req.json();
      const team = await updateTeamConfig(id, updates);
      if (!team) {
        return c.json({ error: 'Team not found' }, 404);
      }
      return c.json({ team });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return c.json({ error: message }, 500);
    }
  },
};

const deleteTeamRoute: ApiRoute = {
  path: '/research/teams/:id',
  method: 'DELETE',
  handler: async (c: any) => {
    const id = c.req.param('id');
    const deleted = await deleteTeamConfig(id);
    if (!deleted) {
      return c.json({ error: 'Team not found' }, 404);
    }
    return c.json({ success: true });
  },
};

// ── Team 模板路由 ────────────────────────────────────────────────────

const listTeamTemplatesRoute: ApiRoute = {
  path: '/research/team-templates',
  method: 'GET',
  handler: async (c: any) => {
    return c.json({ templates: agentTeamTemplates });
  },
};

const createTeamFromTemplateRoute: ApiRoute = {
  path: '/research/teams/from-template',
  method: 'POST',
  handler: async (c: any) => {
    try {
      const { templateId, customName } = await c.req.json();
      const team = await createTeamFromTemplate(templateId, customName);
      if (!team) {
        return c.json({ error: 'Template not found' }, 404);
      }
      return c.json({ team }, 201);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return c.json({ error: message }, 500);
    }
  },
};

// ── Team 执行路由 ────────────────────────────────────────────────────

const executeTeamRoute: ApiRoute = {
  path: '/research/teams/:id/execute',
  method: 'POST',
  handler: async (c: any) => {
    try {
      const teamId = c.req.param('id');
      const body = await c.req.json();
      const { task, target, targets, extraContext } = body;

      if (!task) {
        return c.json({ error: 'Task is required' }, 400);
      }

      const result = await executeTeamTask(c.get('mastra'), {
        teamId,
        task,
        target,
        targets,
        extraContext,
      });

      return c.json({ result });
    } catch (error) {
      console.error('[Team Execute API] Error:', error);
      const message = error instanceof Error ? error.message : String(error);
      return c.json({ error: message }, 500);
    }
  },
};

// ── Team Memory 管理路由 ─────────────────────────────────────────────

const clearTeamMemoryRoute: ApiRoute = {
  path: '/research/teams/:id/memory',
  method: 'DELETE',
  handler: async (c: any) => {
    try {
      const id = c.req.param('id');
      const team = await getTeamConfig(id);
      if (!team) {
        return c.json({ error: 'Team not found' }, 404);
      }
      await clearTeamSharedMemory(id);
      return c.json({ success: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return c.json({ error: message }, 500);
    }
  },
};

// ── 导出所有 Team 路由 ────────────────────────────────────────────────

export const teamRoutes: ApiRoute[] = [
  listTeamsRoute,
  getTeamRoute,
  createTeamRoute,
  updateTeamRoute,
  deleteTeamRoute,
  listTeamTemplatesRoute,
  createTeamFromTemplateRoute,
  executeTeamRoute,
  clearTeamMemoryRoute,
];
