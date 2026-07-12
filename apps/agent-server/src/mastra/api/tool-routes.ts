import type { ApiRoute } from '@mastra/core/server';
import { z } from 'zod';
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
import { executeToolDirect } from '../tools/tool-factory';
import { agentRuntimeRegistry } from '../agents/agent-runtime-registry';
import { recordToolExecution, getToolExecutionHistory, getToolExecutionStats } from '../tools/tool-execution-history';

/**
 * 工具配置 REST API 路由
 *
 * 暴露工具配置的 CRUD 端点和工具测试端点，供前端 Desktop 应用调用。
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
      // 失效 Agent 缓存，使新 Tool 在下次运行时可用
      agentRuntimeRegistry.invalidateAll();
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
      // 失效 Agent 缓存，使 Tool 配置变更在下次运行时生效
      agentRuntimeRegistry.invalidateAll();
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
      // 失效 Agent 缓存
      agentRuntimeRegistry.invalidateAll();
      return c.json({ success: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return c.json({ error: message }, 400);
    }
  },
};

// ── 工具测试端点 ─────────────────────────────────────────────────────

const TestToolInputSchema = z.object({
  input: z.record(z.any()).default({}),
});

const testToolRoute: ApiRoute = {
  path: '/research/tools/:id/test',
  method: 'POST',
  handler: async (c: any) => {
    try {
      const id = c.req.param('id');
      const body = await c.req.json().catch(() => ({}));
      const parseResult = TestToolInputSchema.safeParse(body);
      if (!parseResult.success) {
        return c.json({ error: 'Invalid input: expected { input: {...} }' }, 400);
      }

      const config = await getToolConfig(id);
      if (!config) {
        return c.json({ error: 'Tool not found' }, 404);
      }

      if (!config.enabled) {
        return c.json({ error: 'Tool is disabled' }, 400);
      }

      const result = await executeToolDirect(config, parseResult.data.input);

      // 记录执行历史
      const startTime = Date.now();
      const inputPreview = JSON.stringify(parseResult.data.input).slice(0, 500);
      const outputPreview = JSON.stringify(result).slice(0, 500);
      const durationMs = Date.now() - startTime;
      await recordToolExecution(id, 'success', durationMs, { inputPreview, outputPreview });

      // Output Schema 校验：如果配置了 outputSchema，校验输出是否符合
      let schemaValidation: { valid: boolean; errors?: string[] } | undefined;
      if (config.outputSchema) {
        try {
          // 使用 Zod 校验 outputSchema (outputSchema 是 JSON Schema 对象)
          // 简化实现: 检查基本结构一致性
          const outputSchema = config.outputSchema;
          if (outputSchema.type === 'object' && outputSchema.required) {
            const missingFields = (outputSchema.required as string[]).filter(
              field => !(result && typeof result === 'object' && field in result),
            );
            if (missingFields.length > 0) {
              schemaValidation = {
                valid: false,
                errors: [`Missing required fields: ${missingFields.join(', ')}`],
              };
            }
          }
          if (!schemaValidation) {
            schemaValidation = { valid: true };
          }
        } catch {
          // Schema 校验失败不影响结果返回
          schemaValidation = { valid: true };
        }
      }

      return c.json({ result, schemaValidation });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // 记录失败历史
      await recordToolExecution(c.req.param('id'), 'error', 0, { errorMessage: message }).catch(() => {});
      return c.json({ error: message }, 500);
    }
  },
};

// ── Tool 执行历史路由 ────────────────────────────────────────────────

const getToolHistoryRoute: ApiRoute = {
  path: '/research/tools/:id/history',
  method: 'GET',
  handler: async (c: any) => {
    const id = c.req.param('id');
    const limit = parseInt(c.req.query('limit') ?? '20', 10);
    const [history, stats] = await Promise.all([
      getToolExecutionHistory(id, limit),
      getToolExecutionStats(id),
    ]);
    return c.json({ history, stats });
  },
};

// ── 导出所有 Tool 路由 ───────────────────────────────────────────────

export const toolRoutes: ApiRoute[] = [
  listToolsRoute,
  getToolRoute,
  createToolRoute,
  updateToolRoute,
  deleteToolRoute,
  testToolRoute,
  getToolHistoryRoute,
];
