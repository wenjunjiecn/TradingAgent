# 工具配置系统重设计执行计划

> **创建日期**: 2026-07-09
> **状态**: 待评审
> **涉及范围**: `packages/shared`, `apps/agent-server`, `apps/desktop`

---

## 一、问题根因

### 当前工具的两套割裂体系

```
┌─────────────────────────────────────────────────────────────┐
│  toolRegistry (代码注册表)              tool_configs (DB)    │
│  ┌──────────────────────────┐    ┌────────────────────────┐ │
│  │ marketDataTool           │    │ { id, name, desc,      │ │
│  │   id: 'get-market-data'  │    │   inputSchema(字符串),  │ │
│  │   execute: ✅ 真实逻辑    │    │   outputSchema(字符串), │ │
│  │   inputSchema: ✅ Zod    │    │   config: {} }          │ │
│  │   outputSchema: ✅ Zod   │    │                        │ │
│  ├──────────────────────────┤    │  ❌ 无 execute          │ │
│  │ technicalAnalysisTool    │    │  ❌ Schema 是字符串     │ │
│  │   execute: ✅ 真实逻辑    │    │  ❌ config 字段未使用   │ │
│  ├──────────────────────────┤    │                        │ │
│  │ newsSentimentTool        │    │ 自定义工具:             │ │
│  │   execute: ✅ 真实逻辑    │    │  只有元数据，无法执行    │ │
│  ├──────────────────────────┤    └────────────────────────┘ │
│  │ fundamentalsTool         │           ↑                    │
│  │   execute: ✅ 真实逻辑    │       seedBuiltinTools         │
│  └──────────────────────────┘      (从 registry 复制元数据)   │
│           ↓                          ↓                       │
│     getToolsByIds()            UI CRUD 操作                   │
│     Agent 实例化时使用          用户看到/编辑的               │
└─────────────────────────────────────────────────────────────┘
```

**核心问题**: `tool_configs` 表只是 `toolRegistry` 的元数据影子，缺少 `execute` 函数（函数无法序列化到 JSON），导致用户在 UI 创建的自定义工具永远无法被 Agent 执行。

### ToolConfig Schema 的死字段

| 字段 | 类型 | 问题 |
|------|------|------|
| `inputSchema` | `string` (JSON 字符串) | 存的是 `JSON.stringify(zodSchema)`，不是可执行 Zod，无法用于运行时校验 |
| `outputSchema` | `string` (JSON 字符串) | 同上 |
| `config` | `Record<string, any>` | 定义了但没有任何代码读取它 |

---

## 二、设计目标

### 1. 统一工具来源

消除 `toolRegistry` 和 `tool_configs` 的割裂，建立**单一工具来源 (Single Source of Truth)**：

```
                    ┌──────────────────────┐
                    │   tool_configs (DB)  │  ← 唯一配置来源
                    │   + toolFactory      │  ← 根据 type 动态生成 execute
                    └──────────┬───────────┘
                               │
              ┌────────────────┼────────────────┐
              ▼                ▼                ▼
        Agent 实例化       MCP Server        UI 展示
        (getToolsByIds)   (动态注册)       (CRUD)
```

### 2. 支持多种工具执行类型

| 类型 | 标识 | 适用场景 | execute 来源 |
|------|------|----------|-------------|
| 内置 | `builtin` | 行情/技术分析/新闻/基本面 | 从 `toolRegistry` 取已有实现 |
| HTTP | `http` | 调用外部 REST API | 根据 config 动态构建 fetch 请求 |
| MCP | `mcp` | 连接外部 MCP Server | 通过 MCP 协议调用远程工具 |

### 3. 向后兼容

- 现有 4 个内置工具保持正常工作
- 现有 Agent 配置的 `toolIds` 不需要迁移
- DB schema 迁移自动完成

---

## 三、架构设计

### 3.1 新的 ToolConfig Schema

```typescript
// packages/shared/src/schemas/tool-config.ts

/** 工具执行类型 */
export const ToolTypeSchema = z.enum(['builtin', 'http', 'mcp']);

/** HTTP 工具配置 */
export const HttpToolConfigSchema = z.object({
  url: z.string().url().describe('请求地址'),
  method: z.enum(['GET', 'POST', 'PUT', 'DELETE', 'PATCH']).default('GET'),
  headers: z.record(z.string()).optional().describe('请求头'),
  /** 路径参数映射: { "symbol"": "{{input.symbol}}" } */
  pathParams: z.record(z.string()).optional(),
  /** 查询参数映射 */
  queryParams: z.record(z.string()).optional(),
  /** 请求体模板 (JSON 字符串, 支持 {{input.xxx}} 插值) */
  bodyTemplate: z.string().optional(),
  /** 超时毫秒 */
  timeoutMs: z.number().default(12000),
  /** 响应提取路径 (如 "data.result") */
  responsePath: z.string().optional(),
});

/** MCP 工具配置 */
export const McpToolConfigSchema = z.object({
  serverUrl: z.string().describe('MCP Server URL'),
  serverName: z.string().describe('MCP Server 名称'),
  remoteToolName: z.string().describe('远程工具名称'),
  /** MCP 认证 token (可选) */
  authToken: z.string().optional(),
});

/** 工具配置 Schema (重新设计) */
export const ToolConfigSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  category: ToolCategorySchema.default('custom'),
  type: ToolTypeSchema.default('builtin'),
  enabled: z.boolean().default(true),
  isBuiltin: z.boolean().default(false),

  // Schema 字段 — JSON Schema 格式 (不是 Zod 序列化)
  inputSchema: z.record(z.any()).optional()
    .describe('输入参数 JSON Schema (https://json-schema.org)'),
  outputSchema: z.record(z.any()).optional()
    .describe('输出参数 JSON Schema'),

  // 执行配置 — 根据 type 不同含义不同
  config: z.record(z.any()).optional()
    .describe('执行配置, 根据 type 不同结构不同'),

  createdAt: z.string(),
  updatedAt: z.string(),
});
```

### 3.2 工具工厂 (Tool Factory)

```typescript
// apps/agent-server/src/mastra/tools/tool-factory.ts

import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import type { ToolConfig } from '@trading-agent/shared';
import { toolRegistry } from './tool-registry';
import { jsonSchemaToZod } from './json-schema-converter';

/**
 * 根据 ToolConfig 动态创建 Mastra 工具实例
 *
 * 这是连接 DB 配置和运行时执行的核心桥梁。
 */
export async function createToolFromConfig(config: ToolConfig): Promise<Record<string, any> | null> {
  switch (config.type) {
    case 'builtin':
      return createBuiltinTool(config);
    case 'http':
      return createHttpTool(config);
    case 'mcp':
      return createMcpTool(config);
    default:
      console.warn(`[ToolFactory] Unknown tool type: ${config.type}`);
      return null;
  }
}

/** 内置工具: 从 toolRegistry 取已有实现 */
function createBuiltinTool(config: ToolConfig): Record<string, any> | null {
  const tool = (toolRegistry as Record<string, any>)[config.id];
  if (!tool) {
    console.warn(`[ToolFactory] Builtin tool not found: ${config.id}`);
    return null;
  }
  return { [config.id]: tool };
}

/** HTTP 工具: 动态构建 fetch 请求 */
function createHttpTool(config: ToolConfig): Record<string, any> {
  const httpConfig = config.config as HttpToolConfig;
  const inputZod = config.inputSchema
    ? jsonSchemaToZod(config.inputSchema)
    : z.object({}).passthrough();

  const tool = createTool({
    id: config.id,
    description: config.description,
    inputSchema: inputZod,
    outputSchema: config.outputSchema
      ? jsonSchemaToZod(config.outputSchema)
      : z.any().optional(),
    execute: async (input: Record<string, any>) => {
      return executeHttpRequest(httpConfig, input);
    },
  });

  return { [config.id]: tool };
}

/** MCP 工具: 通过 MCP 协议调用远程工具 */
async function createMcpTool(config: ToolConfig): Promise<Record<string, any> | null> {
  const mcpConfig = config.config as McpToolConfig;
  const inputZod = config.inputSchema
    ? jsonSchemaToZod(config.inputSchema)
    : z.object({}).passthrough();

  const tool = createTool({
    id: config.id,
    description: config.description,
    inputSchema: inputZod,
    outputSchema: z.any().optional(),
    execute: async (input: Record<string, any>) => {
      return executeMcpCall(mcpConfig, input);
    },
  });

  return { [config.id]: tool };
}
```

### 3.3 统一的 getToolsByIds

```typescript
// apps/agent-server/src/mastra/tools/tool-registry.ts (重构后)

import { createToolFromConfig } from './tool-factory';
import { listToolConfigs, getEnabledToolIds } from './tool-config-store';

/** 内置工具注册表 (保留, 但只用于 builtin 类型) */
export const toolRegistry = { ... } as const;

/**
 * 根据 ID 列表获取工具对象映射 (统一入口)
 *
 * 1. 查询 DB 获取 ToolConfig
 * 2. 过滤掉未启用的工具
 * 3. 通过 ToolFactory 根据 type 动态创建
 */
export async function getToolsByIds(ids: string[]): Promise<Record<string, any>> {
  const enabledIds = await getEnabledToolIds();
  const activeIds = ids.filter(id => enabledIds.has(id));

  const allConfigs = await listToolConfigs();
  const configMap = new Map(allConfigs.map(c => [c.id, c]));

  const tools: Record<string, any> = {};

  for (const id of activeIds) {
    const config = configMap.get(id);
    if (!config) {
      // 兜底: 如果 DB 中没有配置，尝试从 toolRegistry 取
      const builtin = (toolRegistry as Record<string, any>)[id];
      if (builtin) tools[id] = builtin;
      continue;
    }

    const toolMap = await createToolFromConfig(config);
    if (toolMap) {
      Object.assign(tools, toolMap);
    }
  }

  return tools;
}
```

### 3.4 Agent 实例化简化

```typescript
// agent-registry.ts — instantiateAgent 不再直接调用 getEnabledToolIds
export async function instantiateAgent(config: AgentConfig): Promise<Agent> {
  // getToolsByIds 内部已处理 enabled 过滤
  const tools = await getToolsByIds(config.toolIds);
  // ... 其余不变
}
```

### 3.5 HTTP 工具执行器

```typescript
// apps/agent-server/src/mastra/tools/http-tool-executor.ts

import type { HttpToolConfig } from '@trading-agent/shared';

/** 模板插值: 将 {{input.xxx}} 替换为实际值 */
function interpolate(template: string, input: Record<string, any>): string {
  return template.replace(/\{\{input\.(\w+)\}\}/g, (_, key) => {
    const val = input[key];
    return val !== undefined ? String(val) : '';
  });
}

/** 执行 HTTP 请求 */
export async function executeHttpRequest(
  config: HttpToolConfig,
  input: Record<string, any>,
): Promise<any> {
  // 1. 构建 URL (路径参数插值)
  let url = config.url;
  if (config.pathParams) {
    for (const [param, template] of Object.entries(config.pathParams)) {
      url = url.replace(`{${param}}`, encodeURIComponent(interpolate(template, input)));
    }
  }

  // 2. 构建查询参数
  if (config.queryParams) {
    const params = new URLSearchParams();
    for (const [key, template] of Object.entries(config.queryParams)) {
      const value = interpolate(template, input);
      if (value) params.set(key, value);
    }
    url += `?${params.toString()}`;
  }

  // 3. 构建请求体
  let body: string | undefined;
  const headers: Record<string, string> = { ...config.headers };
  if (config.bodyTemplate) {
    body = interpolate(config.bodyTemplate, input);
    if (!headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }
  }

  // 4. 发送请求
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);

  try {
    const response = await fetch(url, {
      method: config.method,
      headers,
      body,
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${await response.text().catch(() => '')}`);
    }

    const data = await response.json();

    // 5. 提取响应路径
    if (config.responsePath) {
      return extractPath(data, config.responsePath);
    }
    return data;
  } finally {
    clearTimeout(timeout);
  }
}

/** 从嵌套对象中提取路径 (如 "data.result.items") */
function extractPath(obj: any, path: string): any {
  return path.split('.').reduce((acc, key) => acc?.[key], obj);
}
```

### 3.6 JSON Schema → Zod 转换器

```typescript
// apps/agent-server/src/mastra/tools/json-schema-converter.ts

import { z } from 'zod';

/**
 * 将 JSON Schema 转换为 Zod schema
 * 用于运行时输入校验。
 *
 * 支持: type, properties, required, enum, array, items,
 *       number min/max, string min/max/pattern, nullable
 */
export function jsonSchemaToZod(jsonSchema: Record<string, any>): z.ZodType {
  if (!jsonSchema || typeof jsonSchema !== 'object') {
    return z.any();
  }

  // 处理 $ref (简单内联引用)
  if (jsonSchema.$ref) {
    // 当前实现不支持 $ref 解析, 降级为 any
    return z.any();
  }

  const { type, properties, required, enum: enumValues, items, anyOf, oneOf } = jsonSchema;

  // 枚举
  if (enumValues && Array.isArray(enumValues)) {
    return z.enum(enumValues as [string, ...string[]]);
  }

  // 联合类型
  if (anyOf || oneOf) {
    const schemas = (anyOf || oneOf).map((s: any) => jsonSchemaToZod(s));
    return z.union(schemas as [z.ZodType, z.ZodType, ...z.ZodType[]]);
  }

  switch (type) {
    case 'string':
      return buildStringSchema(jsonSchema);
    case 'number':
    case 'integer':
      return buildNumberSchema(jsonSchema);
    case 'boolean':
      return z.boolean();
    case 'array':
      return buildArraySchema(jsonSchema);
    case 'object':
      return buildObjectSchema(jsonSchema);
    case 'null':
      return z.null();
    default:
      return z.any();
  }
}

function buildStringSchema(schema: Record<string, any>): z.ZodType {
  let s = z.string();
  if (schema.minLength !== undefined) s = s.min(schema.minLength);
  if (schema.maxLength !== undefined) s = s.max(schema.maxLength);
  if (schema.pattern) s = s.regex(new RegExp(schema.pattern));
  if (schema.description) s = s.describe(schema.description);
  if (schema.default !== undefined) s = s.default(schema.default);
  return s;
}

function buildNumberSchema(schema: Record<string, any>): z.ZodType {
  let s = z.number();
  if (schema.minimum !== undefined) s = s.min(schema.minimum);
  if (schema.maximum !== undefined) s = s.max(schema.maximum);
  if (schema.description) s = s.describe(schema.description);
  if (schema.default !== undefined) s = s.default(schema.default);
  return s;
}

function buildArraySchema(schema: Record<string, any>): z.ZodType {
  const itemSchema = schema.items ? jsonSchemaToZod(schema.items) : z.any();
  let s = z.array(itemSchema);
  if (schema.minItems !== undefined) s = s.min(schema.minItems);
  if (schema.maxItems !== undefined) s = s.max(schema.maxItems);
  if (schema.description) s = s.describe(schema.description);
  return s;
}

function buildObjectSchema(schema: Record<string, any>): z.ZodType {
  const props = schema.properties || {};
  const required = new Set(schema.required || []);
  const shape: Record<string, z.ZodType> = {};

  for (const [key, subSchema] of Object.entries(props)) {
    const zodSchema = jsonSchemaToZod(subSchema as Record<string, any>);
    shape[key] = required.has(key) ? zodSchema : zodSchema.optional();
  }

  let s = z.object(shape);
  if (schema.description) s = s.describe(schema.description);
  // 允许额外属性 (宽松模式)
  return s.passthrough();
}
```

---

## 四、实施计划

### Phase 1: Schema 重构与数据迁移 (后端)

**目标**: 重新定义 ToolConfig schema，支持 `type` 和 `config` 字段，完成 DB 迁移。

| # | 任务 | 文件 | 说明 |
|---|------|------|------|
| 1.1 | 重构 `ToolConfigSchema` | `packages/shared/src/schemas/tool-config.ts` | 新增 `type`、`HttpToolConfigSchema`、`McpToolConfigSchema`；`inputSchema`/`outputSchema` 改为 `Record<string, any>` (JSON Schema 对象) |
| 1.2 | DB 迁移脚本 | `apps/agent-server/src/mastra/db-migrations.ts` | 检测旧 schema (inputSchema 为 string) 并迁移为新格式 (JSON.parse 为对象)；新增 `type` 字段默认 `builtin` |
| 1.3 | 更新 `buildBuiltinSeeds` | `apps/agent-server/src/mastra/tools/tool-config-store.ts` | 内置工具种子数据中 `type: 'builtin'`，`inputSchema`/`outputSchema` 从 toolRegistry 取原始 Zod schema 并转换为 JSON Schema |
| 1.4 | 更新 API 路由校验 | `apps/agent-server/src/mastra/api/tool-routes.ts` | 使用新的 `CreateToolConfigInputSchema` 校验 |

**验证**:
- `npm run build -w @trading-agent/shared` 通过
- `npm run build -w @trading-agent/agent-server` 通过
- 启动后内置工具正常种子化，旧数据自动迁移

### Phase 2: 工具工厂与执行器 (后端)

**目标**: 实现 ToolFactory，让自定义工具真正可执行。

| # | 任务 | 文件 | 说明 |
|---|------|------|------|
| 2.1 | JSON Schema → Zod 转换器 | `apps/agent-server/src/mastra/tools/json-schema-converter.ts` | **新建**，实现 `jsonSchemaToZod()` |
| 2.2 | HTTP 工具执行器 | `apps/agent-server/src/mastra/tools/http-tool-executor.ts` | **新建**，实现 `executeHttpRequest()`，支持路径参数/查询参数/请求体模板插值 |
| 2.3 | MCP 工具执行器 | `apps/agent-server/src/mastra/tools/mcp-tool-executor.ts` | **新建**，实现 `executeMcpCall()`，通过 MCP 客户端调用远程工具 |
| 2.4 | 工具工厂 | `apps/agent-server/src/mastra/tools/tool-factory.ts` | **新建**，实现 `createToolFromConfig()`，根据 type 路由到对应执行器 |
| 2.5 | 重构 `getToolsByIds` | `apps/agent-server/src/mastra/tools/tool-registry.ts` | 改为 async，通过 ToolFactory 动态创建工具；保留 `toolRegistry` 仅用于 builtin 类型 |
| 2.6 | 简化 `instantiateAgent` | `apps/agent-server/src/mastra/agents/agent-registry.ts` | 移除 `getEnabledToolIds` 调用（已内聚到 `getToolsByIds`） |
| 2.7 | 工具测试 API | `apps/agent-server/src/mastra/api/tool-routes.ts` | 新增 `POST /research/tools/:id/test` 端点，支持传入参数测试工具执行 |

**验证**:
- 创建一个 HTTP 工具 (如: 调用 CoinGecko API 获取 BTC 价格)，在 Agent 中使用并成功执行
- 内置工具行为不变
- 禁用的工具不被加载

### Phase 3: 前端 UI 重构

**目标**: 支持创建/编辑不同类型的工具，提供类型相关的动态表单。

| # | 任务 | 文件 | 说明 |
|---|------|------|------|
| 3.1 | 更新 i18n | `apps/desktop/src/renderer/i18n/locales/{zh-CN,en}/tools.json` | 新增 type 相关文案 |
| 3.2 | 重构 ToolEditDialog | `apps/desktop/src/renderer/pages/tools/ToolEditDialog.tsx` | 根据 `type` 显示不同配置表单：builtin (只读)、http (URL/Method/Headers/Body 模板)、mcp (Server URL/Tool Name) |
| 3.3 | Schema 编辑器 | 同上 | inputSchema/outputSchema 改用 JSON Schema 编辑器 (CodeMirror + JSON 语法)，预填标准 JSON Schema 模板 |
| 3.4 | 工具测试面板 | `apps/desktop/src/renderer/pages/tools/ToolTestPanel.tsx` | **新建**，调用 `POST /research/tools/:id/test`，展示输入表单和执行结果 |
| 3.5 | 更新工具列表 | `apps/desktop/src/renderer/pages/tools/index.tsx` | 卡片上显示工具类型标签 (内置/HTTP/MCP)；移除「仅元数据」提示 |

**验证**:
- 在 UI 中创建 HTTP 工具并测试执行
- 在 UI 中编辑内置工具 (Schema 只读)
- 工具列表正确显示类型标签

### Phase 4: Agent 编辑页集成

**目标**: Agent 编辑页的工具选择器统一使用 tool_configs 数据源。

| # | 任务 | 文件 | 说明 |
|---|------|------|------|
| 4.1 | 统一数据源 | `apps/desktop/src/renderer/domains/agents/components/agent-edit-page/sections/tools-section.tsx` | 移除 `useTools` (Mastra client)，改为只使用 `useToolConfigs`；工具列表从 tool_configs 取 |
| 4.2 | 显示工具类型和状态 | 同上 | 选择器中每个工具显示类型图标和启用/禁用状态 |
| 4.3 | 清理 `use-all-tools.ts` | `apps/desktop/src/renderer/domains/tools/hooks/use-all-tools.ts` | 保留 `useTool` (单工具详情，Mastra client)，`useTools` 标记废弃并指向 `useToolConfigs` |

**验证**:
- Agent 编辑页工具选择器正确展示所有工具 (含自定义 HTTP/MCP 工具)
- 选择的工具能被 Agent 正确执行

---

## 五、数据迁移策略

### 迁移逻辑 (在 `initToolConfigStore` 中执行)

```typescript
async function migrateToolConfigs(): Promise<void> {
  const db = getDbClient();
  const result = await db.execute(`SELECT id, config FROM ${TABLE_NAME}`);

  const updates: Array<{ sql: string; args: any[] }> = [];

  for (const row of result.rows) {
    const raw = (row as any).config as string;
    try {
      const config = JSON.parse(raw);

      // 检测旧格式: inputSchema/outputSchema 是 string
      const needsMigration =
        typeof config.inputSchema === 'string' ||
        typeof config.outputSchema === 'string' ||
        config.type === undefined;

      if (!needsMigration) continue;

      // 迁移: string → parsed object
      if (typeof config.inputSchema === 'string') {
        try {
          config.inputSchema = config.inputSchema
            ? JSON.parse(config.inputSchema)
            : undefined;
        } catch {
          config.inputSchema = undefined;
        }
      }
      if (typeof config.outputSchema === 'string') {
        try {
          config.outputSchema = config.outputSchema
            ? JSON.parse(config.outputSchema)
            : undefined;
        } catch {
          config.outputSchema = undefined;
        }
      }

      // 新增 type 字段
      if (!config.type) {
        config.type = config.isBuiltin ? 'builtin' : 'http';
      }

      const now = new Date().toISOString();
      updates.push({
        sql: `UPDATE ${TABLE_NAME} SET config = ?, updated_at = ? WHERE id = ?`,
        args: [JSON.stringify(config), now, config.id],
      });
    } catch {
      // 跳过损坏记录
    }
  }

  if (updates.length > 0) {
    await db.batch(updates as never);
    console.log(`[ToolConfigStore] Migrated ${updates.length} tool configs to v2`);
  }
}
```

### 迁移顺序

```
initToolConfigStore()
  1. ensureTable()           ← 建表 (如果不存在)
  2. migrateToolConfigs()    ← 旧格式 → 新格式 (幂等)
  3. seedBuiltinTools()      ← 新增内置工具种子 (type: 'builtin')
```

---

## 六、文件变更清单

### 新建文件

| 文件 | 说明 |
|------|------|
| `apps/agent-server/src/mastra/tools/json-schema-converter.ts` | JSON Schema → Zod 转换器 |
| `apps/agent-server/src/mastra/tools/http-tool-executor.ts` | HTTP 工具执行器 |
| `apps/agent-server/src/mastra/tools/mcp-tool-executor.ts` | MCP 工具执行器 |
| `apps/agent-server/src/mastra/tools/tool-factory.ts` | 工具工厂 (统一创建入口) |
| `apps/desktop/src/renderer/pages/tools/ToolTestPanel.tsx` | 工具测试面板组件 |

### 修改文件

| 文件 | 变更说明 |
|------|----------|
| `packages/shared/src/schemas/tool-config.ts` | 重构 Schema: 新增 type、HttpToolConfigSchema、McpToolConfigSchema |
| `apps/agent-server/src/mastra/tools/tool-config-store.ts` | 新增 migrateToolConfigs(); 更新 buildBuiltinSeeds() |
| `apps/agent-server/src/mastra/tools/tool-registry.ts` | getToolsByIds 改为 async, 通过 ToolFactory 创建 |
| `apps/agent-server/src/mastra/agents/agent-registry.ts` | 简化 instantiateAgent, 移除 getEnabledToolIds |
| `apps/agent-server/src/mastra/api/tool-routes.ts` | 更新 Zod 校验; 新增 test 端点 |
| `apps/desktop/src/renderer/pages/tools/ToolEditDialog.tsx` | 根据 type 动态表单 |
| `apps/desktop/src/renderer/pages/tools/index.tsx` | 显示类型标签; 移除仅元数据提示 |
| `apps/desktop/src/renderer/i18n/locales/zh-CN/tools.json` | 新增 type 相关文案 |
| `apps/desktop/src/renderer/i18n/locales/en/tools.json` | 同上 |
| `apps/desktop/src/renderer/domains/agents/components/agent-edit-page/sections/tools-section.tsx` | 统一使用 useToolConfigs |

---

## 七、验证计划

### Phase 1 验证

```bash
npm run build -w @trading-agent/shared
npm run build -w @trading-agent/agent-server
# 启动后检查日志: [ToolConfigStore] Migrated N tool configs to v2
# 访问 GET /api/research/tools 确认每个工具有 type 字段
```

### Phase 2 验证

```bash
# 创建一个 HTTP 工具 (通过 API)
curl -X POST http://localhost:4111/api/research/tools \
  -H "Content-Type: application/json" \
  -d '{
    "id": "crypto-price",
    "name": "加密货币价格",
    "description": "获取 BTC/ETH 等加密货币当前价格",
    "type": "http",
    "category": "custom",
    "enabled": true,
    "inputSchema": {
      "type": "object",
      "properties": {
        "coin": { "type": "string", "description": "Coin ID, e.g. bitcoin" }
      },
      "required": ["coin"]
    },
    "config": {
      "url": "https://api.coingecko.com/api/v3/simple/price",
      "method": "GET",
      "queryParams": {
        "ids": "{{input.coin}}",
        "vs_currencies": "usd"
      },
      "responsePath": "{{input.coin}}.usd",
      "timeoutMs": 10000
    }
  }'

# 测试执行
curl -X POST http://localhost:4111/api/research/tools/crypto-price/test \
  -H "Content-Type: application/json" \
  -d '{"coin": "bitcoin"}'
# 期望返回: { "result": 63000.00 }
```

### Phase 3 验证

- 在 UI 工具页面点击「新建工具」
- 选择类型为 HTTP
- 填写 URL、Method、Query Params
- 点击「测试」按钮，输入参数，查看执行结果
- 保存后出现在工具列表中，显示 HTTP 标签

### Phase 4 验证

- 进入 Agent 编辑页
- 工具选择器中能看到刚创建的 HTTP 工具
- 选择该工具并保存 Agent
- 在 Playground 中让 Agent 调用该工具，确认执行成功

---

## 八、风险与缓解

| 风险 | 缓解 |
|------|------|
| DB 迁移破坏现有数据 | 迁移逻辑幂等，重复执行不报错；迁移前数据不变更 |
| `getToolsByIds` 从同步改异步导致编译错误 | 搜索所有调用点，统一改为 `await` |
| JSON Schema → Zod 转换不完整 | 支持 passthrough 模式，未知字段不报错；复杂 schema 降级为 `z.any()` |
| HTTP 工具的安全风险 | 不支持任意代码执行；URL 必须是有效 URL；超时控制；后续可加白名单 |
| MCP 工具连接不稳定 | 超时控制 + 错误降级；连接失败返回明确错误信息 |
| 前端 `useTools` (Mastra client) 和 `useToolConfigs` 数据不一致 | Phase 4 统一为 `useToolConfigs`，废弃 `useTools` |

---

## 九、未来扩展方向 (不在本次范围)

| 方向 | 说明 |
|------|------|
| **代码工具** | 允许用户编写 JavaScript 函数作为 execute，通过 VM 沙箱执行 |
| **Prompt 工具** | config 存 prompt 模板，execute 调用 LLM 生成结果 |
| **工具市场** | 导出/导入工具配置 (JSON 文件)，分享给其他用户 |
| **工具权限** | 限制哪些 Agent 可以使用哪些工具 |
| **工具调用日志** | 记录每次工具调用的输入/输出/耗时，用于调试和审计 |
| **Webhook 认证** | HTTP 工具支持 OAuth2/API Key/Bearer Token 等认证方式 |
| **响应转换** | HTTP 工具支持 JSONata/JMESPath 表达式转换响应格式 |
