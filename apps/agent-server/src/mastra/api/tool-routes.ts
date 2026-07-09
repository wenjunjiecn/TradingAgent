import type { ApiRoute } from '@mastra/core/server';
import {
  CreateToolConfigInputSchema,
  ToolConfigSchema,
} from '@trading-agent/shared';
import {
  listToolConfigs,
  getToolConfig,
  createToolConfig,
  updateToolConfig,
  deleteToolConfig,
} from '../tools/tool-config-store';

/**
 * 工具配置 REST API 路由
 *
 * 暴露工具配置的 CRUD 端点，供前端 Desktop 应用调用。
 * 所有路由以 /api 为前缀（Mastra 默认 apiPrefix）。
 */

// ── Tool 配置 CRUD 路由 ──────────────────────────────────────────────

const listToolsRoute: ApiRoute = {
  path: '/research/tools',
  method: 'GET',
  handler: async (c: any) => {
    const tools = await listToolConfigs();
    return c.json({ tools });
  },
};

const getToolRoute: ApiRoute = {
  path: '/research/tools/:id',
  method: 'GET',
  handler: async (c: any) => {
    const id = c.req.param('id');
    const tool = await getToolConfig(id);
    if (!tool) {
      return c.json({ error: 'Tool not found' }, 404);
    }
    return c.json({ tool });
  },
};

const createToolRoute: ApiRoute = {
  path: '/research/tools',
  method: 'POST',
  handler: async (c: any) => {
    try {
      const body = await c.req.json();
      // Zod 校验输入
      const parseResult = CreateToolConfigInputSchema.safeParse(body);
      if (!parseResult.success) {
        const errors = parseResult.error.issues
          .map(i => `${i.path.join('.')}: ${i.message}`)
          .join('; ');
        return c.json({ error: `Validation failed: ${errors}` }, 400);
      }
      const tool = await createToolConfig(parseResult.data);
      return c.json({ tool }, 201);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // 区分重复 ID 错误
      if (message.includes('already exists') || message.includes('UNIQUE constraint') || message.includes('PRIMARY KEY')) {
        return c.json({ error: 'Tool ID already exists' }, 409);
      }
      return c.json({ error: message }, 500);
    }
  },
};

const updateToolRoute: ApiRoute = {
  path: '/research/tools/:id',
  method: 'PUT',
  handler: async (c: any) => {
    try {
      const id = c.req.param('id');
      const updates = await c.req.json();
      // Zod 校验更新字段（部分校验）
      const partialSchema = ToolConfigSchema.partial();
      const parseResult = partialSchema.safeParse(updates);
      if (!parseResult.success) {
        const errors = parseResult.error.issues
          .map(i => `${i.path.join('.')}: ${i.message}`)
          .join('; ');
        return c.json({ error: `Validation failed: ${errors}` }, 400);
      }
      const tool = await updateToolConfig(id, parseResult.data);
      if (!tool) {
        return c.json({ error: 'Tool not found' }, 404);
      }
      return c.json({ tool });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return c.json({ error: message }, 500);
    }
  },
};

const deleteToolRoute: ApiRoute = {
  path: '/research/tools/:id',
  method: 'DELETE',
  handler: async (c: any) => {
    const id = c.req.param('id');
    try {
      const deleted = await deleteToolConfig(id);
      if (!deleted) {
        return c.json({ error: 'Tool not found' }, 404);
      }
      return c.json({ success: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return c.json({ error: message }, 400);
    }
  },
};

// ── 导出所有 Tool 路由 ───────────────────────────────────────────────

export const toolRoutes: ApiRoute[] = [
  listToolsRoute,
  getToolRoute,
  createToolRoute,
  updateToolRoute,
  deleteToolRoute,
];
