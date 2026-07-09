# 工具配置功能修复计划

> **日期**: 2026-07-09
> **状态**: Draft
> **目标**: 修复当前工具配置功能中 `enabled` 开关无效、自定义工具不可用、种子化覆盖用户编辑、两套数据源割裂、缺少输入校验与并发保护等问题，使工具配置页面真正成为 Agent 工具使用的有效控制层。

---

## 一、问题总览

经全面审查，当前工具配置功能存在 **12 个问题**，按严重程度分级如下：

| 级别 | # | 问题 | 影响面 |
|------|---|------|--------|
| 🔴 严重 | 1 | `enabled` 启用/禁用开关完全无效 | 用户操作无效果 |
| 🔴 严重 | 2 | 自定义工具无法被 Agent 实际调用 | 核心功能缺失 |
| 🔴 严重 | 3 | 内置工具编辑在重启后被种子化覆盖 | 数据丢失 |
| 🟠 架构 | 4 | 存在两套完全割裂的工具数据源 | 数据不同步 |
| 🟠 架构 | 5 | `inputSchema`/`outputSchema`/`config` 为死数据 | 无运行时效果 |
| 🟡 健壮性 | 6 | 创建工具时无重复 ID 校验 | 不友好错误 |
| 🟡 健壮性 | 7 | API 路由缺少 Zod 输入校验 | 安全风险 |
| 🟡 健壮性 | 8 | JSON 解析无容错 | 列表崩溃 |
| 🟡 健壮性 | 9 | 初始化存在并发竞态 | 数据竞争 |
| 🟡 健壮性 | 10 | `seedBuiltinTools` 无事务保护 | 不一致状态 |
| 🔵 体验 | 11 | 内置工具 `name` 直接使用 `id` | 不友好 |
| 🔵 体验 | 12 | 编辑对话框对内置工具字段保护不足 | 误导用户 |

---

## 二、问题详细分析

### 2.1 🔴 严重问题

#### 问题 1: `enabled` 启用/禁用开关完全无效

**现象**: UI 显示「禁用后 Agent 将无法使用此工具」，用户可切换启用状态，但实际不影响 Agent 行为。

**根因**: `instantiateAgent()` 实例化 Agent 时通过 `getToolsByIds(config.toolIds)` 从**硬编码的 `toolRegistry`** 取工具，从未查询 `tool_configs` 表中的 `enabled` 字段。

```typescript
// agent-registry.ts:250 — 直接从硬编码 registry 取工具
const tools = getToolsByIds(config.toolIds);

// tool-registry.ts:27-35 — 只查 toolRegistry，不查 DB
export function getToolsByIds(ids: string[]): Record<string, any> {
  for (const id of ids) {
    const tool = (toolRegistry as Record<string, any>)[id];
    if (tool) tools[id] = tool;
  }
  return tools;
}
```

用户在前端禁用工具 → 写入 `tool_configs` 表 → Agent 实例化时不读此表 → 工具照常可用。

#### 问题 2: 自定义工具无法被 Agent 实际使用

**现象**: 用户可新建工具并填写 ID/名称/描述/Schema/配置，但创建后永远无法被任何 Agent 调用。

**根因**: `toolRegistry` 是硬编码常量，只含 4 个内置工具。`getToolsByIds()` 只从此对象查找，自定义工具 ID 不存在其中，会被静默忽略。自定义工具只有 DB 元数据，没有 `execute` 函数实现。

#### 问题 3: 内置工具的 Schema/描述编辑在重启后被覆盖

**现象**: 用户修改内置工具的描述、输入 Schema、输出 Schema，保存成功，但服务器重启后所有修改被还原。

**根因**: `seedBuiltinTools()` 在每次服务启动时执行，对已存在的内置工具强制覆盖 `name`、`description`、`category`、`inputSchema`、`outputSchema`。

```typescript
// tool-config-store.ts:92-100 — 每次启动都覆盖
const updated: ToolConfig = {
  ...old,
  name: seed.name,           // ← 覆盖用户编辑
  description: seed.description,  // ← 覆盖用户编辑
  category: seed.category,        // ← 覆盖用户编辑
  inputSchema: seed.inputSchema,  // ← 覆盖用户编辑
  outputSchema: seed.outputSchema,// ← 覆盖用户编辑
  ...
};
```

### 2.2 🟠 架构问题

#### 问题 4: 存在两套完全割裂的工具数据源

| | Mastra 原生工具系统 | 自定义工具配置系统 |
|---|---|---|
| **前端 Hook** | `useTools()` → `client.listTools()` | `useToolConfigs()` → `/research/tools` API |
| **数据来源** | Mastra 服务端运行时注册的工具 | SQLite `tool_configs` 表 |
| **使用位置** | Agent 编辑页 (`tools-section.tsx`) | 工具配置页 (`pages/tools/`) |
| **是否关联** | ❌ 完全不关联 | ❌ 完全不关联 |

Agent 编辑页选择工具时用 `useTools()`（Mastra 原生 API），工具配置页管理 `useToolConfigs()`（自定义 DB），两者互不影响。

#### 问题 5: `inputSchema`/`outputSchema`/`config` 字段均为死数据

- **`inputSchema`/`outputSchema`**: 存储为 JSON 字符串，但实际工具使用代码中 Zod 定义的 Schema，DB 中的字符串从未被解析使用
- **`config`**: 可填写额外配置项，但没有任何工具实现读取此字段
- 这三个字段在 UI 上可编辑、可保存，但对运行时行为零影响

### 2.3 🟡 健壮性问题

#### 问题 6: 创建工具时无重复 ID 校验

`createToolConfig()` 直接执行 INSERT，不检查 ID 是否已存在。若用户输入与内置工具相同 ID（如 `get-market-data`），触发 SQLite PRIMARY KEY 约束错误，返回原始 500 错误而非友好提示。

#### 问题 7: API 路由缺少输入校验

`CreateToolConfigInputSchema` 已在 `packages/shared` 中定义，但 `tool-routes.ts` 的 POST/PUT 路由完全不做 Zod 校验，直接将 `await c.req.json()` 传给 store 函数。

#### 问题 8: `listToolConfigs` / `getToolConfig` 缺少 JSON 解析容错

```typescript
return result.rows.map(row => JSON.parse((row as any).config) as ToolConfig);
```

若 DB 中任一行的 `config` 字段 JSON 损坏，整个列表接口 500 崩溃，所有工具无法显示。

#### 问题 9: 初始化存在并发竞态

```typescript
let storeInitialized = false;
export async function initToolConfigStore(): Promise<void> {
  if (storeInitialized) return;  // ← 非原子检查
  await ensureTable();
  await seedBuiltinTools();      // ← 耗时操作
  storeInitialized = true;       // ← 赋值在 await 之后
}
```

多个请求同时到达时会并发执行 `seedBuiltinTools()`，导致重复 INSERT 或数据竞争。

#### 问题 10: `seedBuiltinTools` 无事务保护

种子化过程对每个工具执行 SELECT → INSERT/UPDATE 循环，未包裹事务。中途失败会留下部分种子化的不一致状态。

### 2.4 🔵 体验问题

#### 问题 11: 内置工具的 `name` 直接使用 `id`

```typescript
name: tool.id,  // 如 "get-market-data" 而非 "行情数据获取"
```

#### 问题 12: 编辑对话框对内置工具字段保护不足

用户可编辑内置工具的 `name`、`description`、`inputSchema` 等字段，但如问题 3 所述修改在重启后被覆盖，UI 上无任何提示。

---

## 三、修复方案

### 3.1 设计原则

1. **最小侵入**: 优先在现有架构上修补，不引入新的框架或大规模重构
2. **渐进增强**: Phase 1 修复核心功能缺陷，Phase 2 补齐健壮性，Phase 3 优化体验
3. **保持兼容**: 不破坏现有 API 契约，向后兼容已有 DB 数据
4. **明确定位**: 自定义工具如实标注为「元数据配置」，不暗示可直接执行

### 3.2 架构决策

| 决策点 | 方案 | 理由 |
|--------|------|------|
| `enabled` 生效方式 | 在 `instantiateAgent` 中过滤禁用工具 | 最小改动，只改 Agent 实例化路径 |
| 种子化覆盖问题 | 区分「新增」与「已存在」，已存在时仅同步 `isBuiltin` 标记 | 保留用户修改，同时保证内置工具标记正确 |
| 两套数据源统一 | Phase 1 先让 Agent 编辑页感知 `enabled` 状态；Phase 2 后续考虑深度统一 | 深度统一涉及 Mastra client API，风险大，留作后续 |
| 自定义工具定位 | UI 明确标注「元数据配置」，禁用 Schema/Config 编辑或标注为「仅供参考」 | 自定义工具无 `execute` 实现，不能假装可用 |
| 输入校验 | API 路由中使用已定义的 Zod Schema 校验 | 复用 `packages/shared` 中的 Schema |

---

## 四、分阶段实施

### Phase 1: 核心功能修复（让配置真正生效）

**目标**: 修复 `enabled` 开关无效、种子化覆盖、自定义工具定位不清三个严重问题。

#### Task 1.1: 让 `enabled` 字段在 Agent 实例化时生效

**Files:**
- Modify: `apps/agent-server/src/mastra/agents/agent-registry.ts`
- Modify: `apps/agent-server/src/mastra/tools/tool-config-store.ts`
- Modify: `apps/agent-server/src/mastra/tools/tool-registry.ts`

- [ ] **Step 1: 在 `tool-config-store.ts` 中新增 `getEnabledToolIds` 函数**

```typescript
/**
 * 获取所有已启用的工具 ID 集合。
 * 用于 Agent 实例化时过滤掉被禁用的工具。
 */
export async function getEnabledToolIds(): Promise<Set<string>> {
  await initToolConfigStore();
  const all = await listToolConfigs();
  return new Set(all.filter(t => t.enabled).map(t => t.id));
}
```

- [ ] **Step 2: 修改 `agent-registry.ts` 中的 `instantiateAgent` 函数**

在实例化 Agent 前过滤掉被禁用的工具：

```typescript
import { getEnabledToolIds } from '../tools/tool-config-store';

export async function instantiateAgent(
  config: AgentConfig,
  subAgents?: Record<string, Agent>,
): Promise<Agent> {
  // 获取已启用的工具 ID 集合，过滤掉被禁用的工具
  const enabledToolIds = await getEnabledToolIds();
  const activeToolIds = config.toolIds.filter(id => enabledToolIds.has(id));

  if (activeToolIds.length < config.toolIds.length) {
    const disabled = config.toolIds.filter(id => !enabledToolIds.has(id));
    console.warn(
      `[AgentRegistry] Agent "${config.id}" has disabled tools: ${disabled.join(', ')}`
    );
  }

  const tools = getToolsByIds(activeToolIds);
  // ... 其余代码不变
}
```

> **注意**: `instantiateAgent` 从同步函数改为异步函数。需要检查所有调用点并添加 `await`。主要调用点在 `loadAllAgents()` 中（已是 async），需要确认无其他同步调用。

- [ ] **Step 3: 检查 `instantiateAgent` 的所有调用点并适配 async**

```bash
cd /Users/wenjunjie/Documents/antigravity/jolly-curie
grep -rn "instantiateAgent" apps/agent-server/src/ --include="*.ts"
```

确保所有调用处使用 `await instantiateAgent(...)`。

- [ ] **Step 4: 验证编译**

```bash
cd /Users/wenjunjie/Documents/antigravity/jolly-curie
npm run build -w agent-server 2>&1 | tail -20
```

- [ ] **Step 5: 验证功能**

1. 启动 agent-server
2. 在工具配置页面禁用 `technical-analysis` 工具
3. 调用使用该工具的 Agent，确认工具不可用
4. 重新启用，确认工具恢复可用

- [ ] **Step 6: Commit**

```bash
git add apps/agent-server/src/mastra/agents/agent-registry.ts \
  apps/agent-server/src/mastra/tools/tool-config-store.ts \
  apps/agent-server/src/mastra/tools/tool-registry.ts
git commit -m "fix(agent): enforce tool enabled status during agent instantiation"
```

---

#### Task 1.2: 修复种子化覆盖用户编辑问题

**Files:**
- Modify: `apps/agent-server/src/mastra/tools/tool-config-store.ts`

- [ ] **Step 1: 修改 `seedBuiltinTools` 函数，已存在的工具仅同步必要字段**

将种子化逻辑改为：对已存在的内置工具，**只同步 `isBuiltin` 标记**，不再覆盖用户可编辑的字段（`name`、`description`、`category`、`inputSchema`、`outputSchema`）。

```typescript
async function seedBuiltinTools(): Promise<void> {
  const db = getDbClient();
  const seeds = buildBuiltinSeeds();
  const now = new Date().toISOString();

  for (const seed of seeds) {
    const existing = await db.execute({
      sql: `SELECT config FROM ${TABLE_NAME} WHERE id = ?`,
      args: [seed.id],
    });

    if (existing.rows.length === 0) {
      // 新增内置工具 — 使用种子数据完整插入
      await db.execute({
        sql: `INSERT INTO ${TABLE_NAME} (id, config, created_at, updated_at) VALUES (?, ?, ?, ?)`,
        args: [seed.id, JSON.stringify(seed), seed.createdAt, now],
      });
    } else {
      // 已存在的工具 — 仅同步 isBuiltin 标记，保留用户所有编辑
      try {
        const old: ToolConfig = JSON.parse((existing.rows[0] as any).config);
        // 只有当 isBuiltin 标记不一致时才更新（如手动迁移场景）
        if (!old.isBuiltin) {
          const updated: ToolConfig = {
            ...old,
            isBuiltin: true,
            updatedAt: now,
          };
          await db.execute({
            sql: `UPDATE ${TABLE_NAME} SET config = ?, updated_at = ? WHERE id = ?`,
            args: [JSON.stringify(updated), now, seed.id],
          });
        }
      } catch {
        // JSON 解析失败，用种子数据覆盖损坏的记录
        console.warn(`[ToolConfigStore] Corrupt config for "${seed.id}", overwriting with seed`);
        await db.execute({
          sql: `UPDATE ${TABLE_NAME} SET config = ?, updated_at = ? WHERE id = ?`,
          args: [JSON.stringify(seed), now, seed.id],
        });
      }
    }
  }

  console.log(`[ToolConfigStore] Synced ${seeds.length} builtin tools`);
}
```

- [ ] **Step 2: 验证编译**

```bash
npm run build -w agent-server 2>&1 | tail -20
```

- [ ] **Step 3: 验证功能**

1. 启动服务
2. 编辑内置工具的描述，保存
3. 重启服务
4. 确认编辑后的描述仍然保留

- [ ] **Step 4: Commit**

```bash
git add apps/agent-server/src/mastra/tools/tool-config-store.ts
git commit -m "fix(agent): stop overwriting user edits to builtin tools on restart"
```

---

#### Task 1.3: 明确自定义工具的定位与 UI 标注

**Files:**
- Modify: `apps/desktop/src/renderer/pages/tools/ToolEditDialog.tsx`
- Modify: `apps/desktop/src/renderer/pages/tools/index.tsx`
- Modify: `apps/desktop/src/renderer/i18n/locales/zh-CN/tools.json`
- Modify: `apps/desktop/src/renderer/i18n/locales/en/tools.json`

- [ ] **Step 1: 添加 i18n 翻译 key**

在 `zh-CN/tools.json` 的 `edit` 对象中添加：
```json
{
  "edit": {
    "metadataOnlyHint": "自定义工具仅保存元数据配置（名称、描述、分类）。工具的实际执行逻辑需要在后端代码中实现并注册到 toolRegistry 后才能被 Agent 调用。",
    "metadataOnlyBadge": "仅元数据",
    "builtinReadOnlyFields": "内置工具的 Schema 和描述由代码定义，修改仅供参考，不会影响工具实际行为。"
  }
}
```

在 `en/tools.json` 的 `edit` 对象中添加：
```json
{
  "edit": {
    "metadataOnlyHint": "Custom tools only save metadata (name, description, category). The actual execution logic must be implemented in backend code and registered in toolRegistry before agents can use it.",
    "metadataOnlyBadge": "Metadata Only",
    "builtinReadOnlyFields": "Schema and description of built-in tools are defined in code. Edits are for reference only and do not affect tool behavior."
  }
}
```

- [ ] **Step 2: 在 `ToolEditDialog.tsx` 中添加提示信息**

在新建工具模式下，在表单顶部显示「仅元数据」提示：

```tsx
{/* 仅在新建模式且非内置工具时显示 */}
{!isEditing && (
  <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-400">
    <AlertCircle className="mt-0.5 size-4 shrink-0" />
    <span>{t('tools:edit.metadataOnlyHint')}</span>
  </div>
)}

{/* 编辑内置工具时显示提示 */}
{isEditing && tool?.isBuiltin && (
  <div className="flex items-start gap-2 rounded-lg border border-blue-500/30 bg-blue-500/5 p-3 text-xs text-blue-400">
    <AlertCircle className="mt-0.5 size-4 shrink-0" />
    <span>{t('tools:edit.builtinReadOnlyFields')}</span>
  </div>
)}
```

- [ ] **Step 3: 在工具列表卡片中对自定义工具显示「仅元数据」标签**

在 `index.tsx` 的工具卡片中，对自定义工具添加额外标签：

```tsx
{!tool.isBuiltin && (
  <span className="shrink-0 rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-400">
    {t('tools:edit.metadataOnlyBadge')}
  </span>
)}
```

- [ ] **Step 4: 验证编译 + 运行**

```bash
cd /Users/wenjunjie/Documents/antigravity/jolly-curie/apps/desktop
npx tsc --noEmit -p tsconfig.vite.json 2>&1 | head -10
```

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/renderer/pages/tools/ \
  apps/desktop/src/renderer/i18n/locales/zh-CN/tools.json \
  apps/desktop/src/renderer/i18n/locales/en/tools.json
git commit -m "feat(desktop): clarify custom tool metadata-only nature in UI"
```

---

### Phase 2: 健壮性补齐

**目标**: 修复输入校验、重复 ID 检查、JSON 解析容错、并发竞态、事务保护等健壮性问题。

#### Task 2.1: API 路由添加 Zod 输入校验

**Files:**
- Modify: `apps/agent-server/src/mastra/api/tool-routes.ts`

- [ ] **Step 1: 在 POST/PUT 路由中添加 Zod 校验**

```typescript
import {
  CreateToolConfigInputSchema,
  ToolConfigSchema,
} from '@trading-agent/shared';

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
      if (message.includes('UNIQUE constraint') || message.includes('PRIMARY KEY')) {
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
```

- [ ] **Step 2: 验证编译**

```bash
npm run build -w agent-server 2>&1 | tail -20
```

- [ ] **Step 3: Commit**

```bash
git add apps/agent-server/src/mastra/api/tool-routes.ts
git commit -m "fix(server): add Zod validation to tool config API routes"
```

---

#### Task 2.2: 创建工具时添加重复 ID 检查

**Files:**
- Modify: `apps/agent-server/src/mastra/tools/tool-config-store.ts`

- [ ] **Step 1: 在 `createToolConfig` 中添加重复检查**

```typescript
export async function createToolConfig(
  input: CreateToolConfigInput,
): Promise<ToolConfig> {
  await initToolConfigStore();
  const db = getDbClient();

  // 检查 ID 是否已存在
  const existing = await getToolConfig(input.id);
  if (existing) {
    throw new Error(`Tool ID "${input.id}" already exists`);
  }

  const now = new Date().toISOString();
  const config: ToolConfig = {
    ...input,
    isBuiltin: false,
    createdAt: now,
    updatedAt: now,
  };

  await db.execute({
    sql: `INSERT INTO ${TABLE_NAME} (id, config, created_at, updated_at) VALUES (?, ?, ?, ?)`,
    args: [config.id, JSON.stringify(config), now, now],
  });

  return config;
}
```

- [ ] **Step 2: 验证编译 + 功能测试**

```bash
npm run build -w agent-server 2>&1 | tail -20
```

尝试创建重复 ID 的工具，确认返回 409 或友好错误消息。

- [ ] **Step 3: Commit**

```bash
git add apps/agent-server/src/mastra/tools/tool-config-store.ts
git commit -m "fix(server): check duplicate tool ID before creating tool config"
```

---

#### Task 2.3: JSON 解析容错

**Files:**
- Modify: `apps/agent-server/src/mastra/tools/tool-config-store.ts`

- [ ] **Step 1: 在 `listToolConfigs` 和 `getToolConfig` 中添加 try-catch**

```typescript
/** 安全解析工具配置 JSON，解析失败时返回 null */
function safeParseToolConfig(raw: unknown): ToolConfig | null {
  if (typeof raw !== 'string') return null;
  try {
    return JSON.parse(raw) as ToolConfig;
  } catch {
    console.error('[ToolConfigStore] Failed to parse tool config JSON');
    return null;
  }
}

/** 列出所有工具配置 */
export async function listToolConfigs(): Promise<ToolConfig[]> {
  await initToolConfigStore();
  const db = getDbClient();
  const result = await db.execute(`SELECT config FROM ${TABLE_NAME} ORDER BY created_at ASC`);
  return result.rows
    .map(row => safeParseToolConfig((row as any).config))
    .filter((t): t is ToolConfig => t !== null);
}

/** 获取单个工具配置 */
export async function getToolConfig(id: string): Promise<ToolConfig | null> {
  await initToolConfigStore();
  const db = getDbClient();
  const result = await db.execute({
    sql: `SELECT config FROM ${TABLE_NAME} WHERE id = ?`,
    args: [id],
  });
  if (result.rows.length === 0) return null;
  return safeParseToolConfig((result.rows[0] as any).config);
}
```

- [ ] **Step 2: 验证编译**

```bash
npm run build -w agent-server 2>&1 | tail -20
```

- [ ] **Step 3: Commit**

```bash
git add apps/agent-server/src/mastra/tools/tool-config-store.ts
git commit -m "fix(server): add JSON parse error tolerance to tool config queries"
```

---

#### Task 2.4: 修复初始化并发竞态

**Files:**
- Modify: `apps/agent-server/src/mastra/tools/tool-config-store.ts`

- [ ] **Step 1: 使用 Promise 缓存替代布尔标志**

```typescript
let initPromise: Promise<void> | null = null;

/** 初始化工具配置存储（并发安全） */
export async function initToolConfigStore(): Promise<void> {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    await ensureTable();
    await seedBuiltinTools();
  })();
  return initPromise;
}
```

- [ ] **Step 2: 验证编译**

```bash
npm run build -w agent-server 2>&1 | tail -20
```

- [ ] **Step 3: Commit**

```bash
git add apps/agent-server/src/mastra/tools/tool-config-store.ts
git commit -m "fix(server): resolve init race condition in tool config store"
```

---

#### Task 2.5: 为 `seedBuiltinTools` 添加事务保护

**Files:**
- Modify: `apps/agent-server/src/mastra/tools/tool-config-store.ts`

- [ ] **Step 1: 将种子化操作包裹在事务中**

```typescript
async function seedBuiltinTools(): Promise<void> {
  const db = getDbClient();
  const seeds = buildBuiltinSeeds();
  const now = new Date().toISOString();

  // 使用事务保证原子性
  await db.execute('BEGIN');
  try {
    for (const seed of seeds) {
      const existing = await db.execute({
        sql: `SELECT config FROM ${TABLE_NAME} WHERE id = ?`,
        args: [seed.id],
      });

      if (existing.rows.length === 0) {
        await db.execute({
          sql: `INSERT INTO ${TABLE_NAME} (id, config, created_at, updated_at) VALUES (?, ?, ?, ?)`,
          args: [seed.id, JSON.stringify(seed), seed.createdAt, now],
        });
      } else {
        // ... 同 Task 1.2 的已存在处理逻辑
      }
    }
    await db.execute('COMMIT');
  } catch (error) {
    await db.execute('ROLLBACK');
    throw error;
  }

  console.log(`[ToolConfigStore] Synced ${seeds.length} builtin tools`);
}
```

> **注意**: 需要确认 libsql 客户端是否支持 `BEGIN`/`COMMIT`/`ROLLBACK` 语句。如果不支持，可以使用 `db.batch()` 批量操作或 `db.transaction()` API。

- [ ] **Step 2: 验证编译**

```bash
npm run build -w agent-server 2>&1 | tail -20
```

- [ ] **Step 3: Commit**

```bash
git add apps/agent-server/src/mastra/tools/tool-config-store.ts
git commit -m "fix(server): wrap builtin tool seeding in database transaction"
```

---

### Phase 3: 体验优化

**目标**: 改善内置工具名称、编辑对话框字段保护、Agent 编辑页工具状态同步。

#### Task 3.1: 改善内置工具显示名称

**Files:**
- Modify: `apps/agent-server/src/mastra/tools/tool-config-store.ts`

- [ ] **Step 1: 在 `buildBuiltinSeeds` 中添加友好的工具名称映射**

```typescript
const TOOL_DISPLAY_NAMES: Record<string, string> = {
  'get-market-data': '行情数据获取',
  'technical-analysis': '技术指标分析',
  'news-sentiment': '新闻情绪分析',
  'fundamentals': '基本面数据',
};

function buildBuiltinSeeds(): ToolConfig[] {
  // ...
  return Object.values(toolRegistry).map((tool: any) => {
    // ...
    return {
      id: tool.id,
      name: TOOL_DISPLAY_NAMES[tool.id] ?? tool.id,  // ← 使用友好名称
      description: tool.description ?? '',
      // ...
    };
  });
}
```

> **注意**: 由于 Task 1.2 已修复种子化覆盖问题，此修改只影响**新创建**的内置工具种子。已有 DB 中的工具名称不会被覆盖。如需更新已有名称，可手动在 DB 中更新或在 UI 上编辑。

- [ ] **Step 2: 验证编译**

- [ ] **Step 3: Commit**

```bash
git add apps/agent-server/src/mastra/tools/tool-config-store.ts
git commit -m "feat(agent): use friendly display names for builtin tools"
```

---

#### Task 3.2: 编辑对话框中禁用内置工具的只读字段

**Files:**
- Modify: `apps/desktop/src/renderer/pages/tools/ToolEditDialog.tsx`
- Modify: `apps/desktop/src/renderer/i18n/locales/zh-CN/tools.json`
- Modify: `apps/desktop/src/renderer/i18n/locales/en/tools.json`

- [ ] **Step 1: 添加 i18n key**

`zh-CN/tools.json`:
```json
{
  "edit": {
    "builtinFieldsLocked": "内置工具的 Schema 由代码定义，此处不可编辑"
  }
}
```

`en/tools.json`:
```json
{
  "edit": {
    "builtinFieldsLocked": "Built-in tool schemas are defined in code and cannot be edited here"
  }
}
```

- [ ] **Step 2: 在 `ToolEditDialog.tsx` 中对内置工具禁用 Schema 字段编辑**

```tsx
// 在组件中获取 isBuiltin 状态
const isBuiltin = tool?.isBuiltin ?? false;

// inputSchema textarea 添加 disabled 属性
<textarea
  value={inputSchema}
  onChange={...}
  disabled={isBuiltin}
  className={`${jsonTextareaClass(jsonErrors.inputSchema)} ${isBuiltin ? 'opacity-60 cursor-not-allowed' : ''}`}
  placeholder={t('tools:edit.inputSchemaPlaceholder')}
/>

// outputSchema textarea 同理
<textarea
  value={outputSchema}
  onChange={...}
  disabled={isBuiltin}
  className={`${jsonTextareaClass(jsonErrors.outputSchema)} ${isBuiltin ? 'opacity-60 cursor-not-allowed' : ''}`}
  placeholder={t('tools:edit.outputSchemaPlaceholder')}
/>

// 在 Schema 字段下方添加提示
{isBuiltin && (
  <p className="mt-0.5 text-[10px] text-neutral4">
    {t('tools:edit.builtinFieldsLocked')}
  </p>
)}
```

- [ ] **Step 3: 验证编译 + 运行**

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/src/renderer/pages/tools/ToolEditDialog.tsx \
  apps/desktop/src/renderer/i18n/locales/zh-CN/tools.json \
  apps/desktop/src/renderer/i18n/locales/en/tools.json
git commit -m "feat(desktop): disable schema editing for builtin tools in edit dialog"
```

---

#### Task 3.3: Agent 编辑页工具选择器显示禁用状态

**Files:**
- Modify: `apps/desktop/src/renderer/domains/agents/components/agent-edit-page/sections/tools-section.tsx`

- [ ] **Step 1: 在 Agent 编辑页的工具选择器中，引入 `useToolConfigs` 数据并标注禁用状态**

```tsx
import { useToolConfigs } from '@/lib/tool-api';

export function ToolsSection({ control, error, readOnly = false }: ToolsSectionProps) {
  // ... 现有代码 ...
  const { data: toolConfigsData } = useToolConfigs();
  const disabledToolIds = useMemo(() => {
    const set = new Set<string>();
    for (const t of toolConfigsData?.tools ?? []) {
      if (!t.enabled) set.add(t.id);
    }
    return set;
  }, [toolConfigsData]);

  // 在 options 中标注禁用状态
  const options = useMemo(() => {
    if (!tools) return [];
    return Object.entries(tools).map(([id, tool]) => ({
      value: id,
      label: (tool as { name?: string }).name || id,
      description: (tool as { description?: string }).description || '',
      disabled: disabledToolIds.has(id),  // ← 新增
    }));
  }, [tools, disabledToolIds]);
```

- [ ] **Step 2: 在 Combobox 渲染中处理 disabled 选项的视觉样式**

根据 Combobox 组件是否支持 `disabled` 属性的 option，添加视觉降级（灰色、不可选择）。

- [ ] **Step 3: 验证编译 + 运行**

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/src/renderer/domains/agents/components/agent-edit-page/sections/tools-section.tsx
git commit -m "feat(desktop): show disabled tool status in agent editor tool picker"
```

---

## 五、文件变更清单

### 修改文件

| # | 文件路径 | Phase | 变更摘要 |
|---|---------|-------|---------|
| 1 | `apps/agent-server/src/mastra/agents/agent-registry.ts` | P1 | `instantiateAgent` 改为 async，过滤禁用工具 |
| 2 | `apps/agent-server/src/mastra/tools/tool-config-store.ts` | P1+P2 | 修复种子化覆盖、添加 `getEnabledToolIds`、重复 ID 检查、JSON 容错、并发安全、事务保护、友好名称 |
| 3 | `apps/agent-server/src/mastra/tools/tool-registry.ts` | P1 | 可能需要导出辅助函数（视实现而定） |
| 4 | `apps/agent-server/src/mastra/api/tool-routes.ts` | P2 | 添加 Zod 校验、区分错误码 |
| 5 | `apps/desktop/src/renderer/pages/tools/ToolEditDialog.tsx` | P1+P3 | 添加元数据提示、禁用内置工具 Schema 编辑 |
| 6 | `apps/desktop/src/renderer/pages/tools/index.tsx` | P1 | 自定义工具「仅元数据」标签 |
| 7 | `apps/desktop/src/renderer/i18n/locales/zh-CN/tools.json` | P1+P3 | 新增翻译 key |
| 8 | `apps/desktop/src/renderer/i18n/locales/en/tools.json` | P1+P3 | 新增翻译 key |
| 9 | `apps/desktop/src/renderer/domains/agents/components/agent-edit-page/sections/tools-section.tsx` | P3 | 工具选择器显示禁用状态 |

---

## 六、验收标准

### Phase 1 验收

- [ ] 在工具配置页面禁用 `technical-analysis` 工具后，使用该工具的 Agent 无法调用它
- [ ] 重新启用后，Agent 可正常调用
- [ ] 编辑内置工具描述后重启服务，编辑内容仍然保留
- [ ] 新建工具页面显示「仅元数据」提示
- [ ] 编辑内置工具时显示 Schema 由代码定义的提示

### Phase 2 验收

- [ ] 创建工具时输入重复 ID 返回 409 错误和友好提示
- [ ] POST/PUT 请求字段不符合 Schema 时返回 400 错误和具体字段信息
- [ ] DB 中某条 config JSON 损坏时，列表接口仍可正常返回其他工具
- [ ] 服务启动后快速发送多个请求，不会出现重复种子化日志

### Phase 3 验收

- [ ] 新安装的实例中，内置工具显示友好名称（如「行情数据获取」而非 `get-market-data`）
- [ ] 编辑内置工具时，Schema 字段不可编辑且有提示说明
- [ ] Agent 编辑页的工具选择器中，被禁用的工具显示为灰色/不可选状态

---

## 七、风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| `instantiateAgent` 改为 async 后，调用点遗漏 `await` | Agent 工具绑定失败 | 全局搜索调用点逐一适配，编译检查 |
| libsql 不支持 `BEGIN`/`COMMIT` 语句 | 事务保护无效 | 改用 `db.batch()` 或 `db.transaction()` API |
| `enabled` 过滤导致已有 Agent 突然缺少工具 | 用户体验中断 | 在禁用工具时添加确认提示，说明会影响哪些 Agent |
| 种子化不再覆盖 Schema 后，代码更新了工具描述但 DB 不更新 | 内置工具描述过时 | 用户可手动在 UI 删除工具行重新种子化，或后续添加「重置内置工具」按钮 |
| Mastra client API 与自定义 tool config API 数据不统一 | 两套系统仍有割裂 | Phase 3 Task 3.3 做初步桥接；深度统一留作后续迭代 |

---

## 八、执行顺序总结

```
Phase 1 (核心功能修复)
  Task 1.1 (enabled 生效) → Task 1.2 (种子化修复) → Task 1.3 (UI 标注)
        ↓
Phase 2 (健壮性补齐 — 可并行)
  Task 2.1 (API 校验) ────────┐
  Task 2.2 (重复 ID 检查) ────┤
  Task 2.3 (JSON 容错) ───────┼→ Task 2.5 (事务保护)
  Task 2.4 (并发安全) ────────┘
        ↓
Phase 3 (体验优化 — 可并行)
  Task 3.1 (友好名称) ────────┐
  Task 3.2 (字段保护) ────────┼→ Task 3.3 (Agent 编辑页同步)
                               ┘
```

> **备注**: Phase 1 必须先行，因为 Phase 2/3 依赖核心逻辑正确。Phase 2 的各 Task 之间无依赖，可并行。Phase 3 的 Task 3.3 依赖 Phase 1 Task 1.1 的 `enabled` 生效逻辑。预计总工时 2-3 天。
