# 项目结构优化执行计划

> **日期**: 2026-07-08
> **状态**: Draft
> **目标**: 修复项目结构中偏离行业最佳实践的问题，提升工程化水平、构建效率和代码可维护性。

---

## 一、问题总览

| # | 问题 | 优先级 | 影响面 |
|---|------|--------|--------|
| 1 | 缺少 Monorepo 构建编排工具，依赖手动串联 | P1 | 全局构建效率 |
| 2 | 包名命名不一致（有 scope / 无 scope / 外部 scope 混用） | P1 | 包引用清晰度 |
| 3 | TypeScript 版本不一致（shared: ^5.4.5, 其他: ^6.0.3） | P0 | 类型推断一致性 |
| 4 | 数据库文件位于源码目录和根目录 | P0 | 代码整洁、部署 |
| 5 | `packages/shared` 单文件 329 行，结构过于扁平 | P2 | 可维护性 |
| 6 | Electron 打包与 Agent Server 构建依赖仅靠脚本顺序保证 | P1 | 构建可靠性 |
| 7 | E2E 测试目录嵌套 pnpm workspace | P1 | 包管理器一致性 |
| 8 | 缺少 CI/CD 和自动化测试基础设施 | P2 | 持续集成 |
| 9 | DB 迁移逻辑混在 `agent-registry.ts` 中 | P2 | 关注点分离 |
| 10 | `restart-dev.sh` 可被 npm scripts 替代 | P3 | 开发体验 |
| 11 | `.env.example` 缺少部分环境变量 | P2 | 配置文档完整性 |

---

## 二、架构现状

```
jolly-curie/
├── package.json              # npm workspaces root
├── apps/
│   ├── agent-server/         # Mastra 后端 (包名: agent-server)
│   │   └── src/mastra/
│   │       ├── agents/
│   │       ├── api/
│   │       ├── db.ts         # DB_URL = 'file:./mastra.db' (硬编码)
│   │       ├── public/       # ❌ 包含 mastra.db 等运行时文件
│   │       ├── teams/
│   │       ├── tools/
│   │       └── workflows/
│   └── desktop/              # Electron 前端 (包名: trading-agent)
│       ├── e2e/
│       │   └── kitchen-sink/ # ❌ 嵌套 pnpm workspace
│       │       ├── pnpm-lock.yaml
│       │       └── pnpm-workspace.yaml
│       └── src/
│           ├── main/
│           ├── preload/
│           └── renderer/
├── packages/
│   ├── shared/               # 共享类型 (包名: @trading-agent/shared) ✅
│   │   └── src/index.ts      # ❌ 329 行单文件
│   └── playground-ui/        # UI 组件库 (包名: @mastra/playground-ui)
├── mastra.db                 # ❌ 运行时 DB 文件在根目录
├── mastra.db-shm
├── mastra.db-wal
├── mastra.duckdb
├── mastra.duckdb.wal
└── restart-dev.sh            # 可被 npm scripts 替代
```

---

## 三、分阶段实施

### Phase 1: P0 快速修复（TypeScript 版本统一 + 数据库文件迁移）

**目标**: 消除最紧急的类型不一致和文件位置问题。

#### Task 1.1: 统一 TypeScript 版本

**Files:**
- Modify: `packages/shared/package.json`

**Problem:** `packages/shared` 使用 `typescript: ^5.4.5`，而 `agent-server` 和 `desktop` 使用 `typescript: ^6.0.3`。跨版本 TS 可能导致类型推断差异。

- [ ] **Step 1: 升级 shared 包的 TypeScript 版本**

```bash
cd /Users/wenjunjie/Documents/antigravity/jolly-curie/packages/shared
npm install --save-dev typescript@^6.0.3
```

- [ ] **Step 2: 验证 shared 包编译**

```bash
cd /Users/wenjunjie/Documents/antigravity/jolly-curie/packages/shared
npx tsc --noEmit
```

预期：无 error。

- [ ] **Step 3: 验证下游包编译**

```bash
cd /Users/wenjunjie/Documents/antigravity/jolly-curie
npm run build -w @trading-agent/shared
cd apps/agent-server && npx tsc --noEmit 2>&1 | head -20
cd ../desktop && npx tsc --noEmit -p tsconfig.vite.json 2>&1 | head -20
```

- [ ] **Step 4: Commit**

```bash
cd /Users/wenjunjie/Documents/antigravity/jolly-curie
git add packages/shared/package.json package-lock.json
git commit -m "fix(shared): unify TypeScript version to ^6.0.3 across all workspaces"
```

---

#### Task 1.2: 数据库文件迁移出源码目录

**Files:**
- Modify: `apps/agent-server/src/mastra/db.ts`
- Modify: `apps/agent-server/src/mastra/index.ts` (storage URL)
- Modify: `apps/agent-server/src/mastra/agents/agent-registry.ts` (DB_URL)
- Modify: `apps/agent-server/src/mastra/teams/team-shared-memory.ts` (DB_URL, 如存在硬编码)
- Modify: `.gitignore`
- Delete: `apps/agent-server/src/mastra/public/mastra.db` 等运行时文件
- Delete: 根目录的 `mastra.db`, `mastra.db-shm`, `mastra.db-wal`, `mastra.duckdb`, `mastra.duckdb.wal`

**Problem:**
1. `apps/agent-server/src/mastra/public/` 目录下有 `mastra.db`、`mastra.duckdb` 等运行时数据库文件，不应出现在源码树中。
2. 根目录也有 `mastra.db` 等文件（由 `file:./mastra.db` 相对路径在不同工作目录下生成）。
3. `DB_URL` 硬编码为 `'file:./mastra.db'`，依赖运行时工作目录。

**Solution:**
- 数据库文件统一存放在 `data/` 目录（位于 monorepo 根目录）。
- `DB_URL` 通过环境变量配置，默认值为 `file:./data/mastra.db`。
- 清理源码目录和根目录中的数据库文件。

- [ ] **Step 1: 创建 data 目录并添加 .gitkeep**

```bash
cd /Users/wenjunjie/Documents/antigravity/jolly-curie
mkdir -p data
touch data/.gitkeep
```

- [ ] **Step 2: 更新 `.gitignore`**

在 `.gitignore` 中将数据库文件的排除规则从全局 `*.db` 改为更精确的路径：

```gitignore
# Dependencies
node_modules/

# Environment variables (contains API keys)
.env

# Mastra runtime files
.mastra/

# Database files (runtime data, not source)
data/*.db
data/*.db-shm
data/*.db-wal
data/*.duckdb
data/*.duckdb.wal

# Build output
dist/
dist-electron/
dist-app/
.turbo/

# Logs
*.log

# OS
.DS_Store

# Desktop client files
apps/desktop/dist/
apps/desktop/dist-electron/
apps/desktop/dist-app/
*.zip
```

- [ ] **Step 3: 修改 `db.ts` — 支持环境变量配置 DB 路径**

```typescript
// apps/agent-server/src/mastra/db.ts
import { createClient, type Client } from '@libsql/client';
import { mkdirSync, dirname } from 'node:fs';
import { resolve } from 'node:path';

/**
 * 共享数据库客户端
 *
 * 所有 store 模块共用一个 LibSQL 连接，避免多个独立连接的：
 * - 重复连接建立开销
 * - 各自独立的 page cache（无法共享）
 * - 并发写时的 lock 竞争
 *
 * DB 路径通过环境变量 MASTRA_DB_URL 配置，默认为 ./data/mastra.db
 */
const DB_URL = process.env.MASTRA_DB_URL ?? 'file:./data/mastra.db';

// 确保数据目录存在（仅对 file: 协议生效）
if (DB_URL.startsWith('file:')) {
  const dbPath = DB_URL.slice('file:'.length);
  const absPath = resolve(process.cwd(), dbPath);
  mkdirSync(dirname(absPath), { recursive: true });
}

let sharedClient: Client | null = null;

/** 获取共享数据库客户端（单例） */
export function getDb(): Client {
  if (!sharedClient) {
    sharedClient = createClient({ url: DB_URL });
  }
  return sharedClient;
}

/** 导出 DB_URL 供其他模块使用（避免硬编码重复） */
export { DB_URL };
```

- [ ] **Step 4: 修改 `agent-registry.ts` — 从 db.ts 导入 DB_URL**

将 `agent-registry.ts` 中的 `const DB_URL = 'file:./mastra.db';` 改为从 `db.ts` 导入：

```typescript
// 在文件顶部 import 区添加：
import { getDb, DB_URL } from '../db';

// 删除原有的 const DB_URL = 'file:./mastra.db';
```

- [ ] **Step 5: 修改 `index.ts` — storage URL 使用环境变量**

将 `index.ts` 中的 storage 配置改为：

```typescript
const storage = new MastraCompositeStore({
  id: 'composite-storage',
  default: new LibSQLStore({
    id: 'mastra-storage',
    url: process.env.MASTRA_DB_URL ?? 'file:./data/mastra.db',
  }),
  editor: new LibSQLStore({
    id: 'mastra-editor-storage',
    url: process.env.MASTRA_DB_URL ?? 'file:./data/mastra.db',
  }),
});
```

- [ ] **Step 6: 搜索并修复所有硬编码的 DB URL**

```bash
cd /Users/wenjunjie/Documents/antigravity/jolly-curie
grep -rn "file:./mastra.db" apps/agent-server/src/ --include="*.ts"
```

将所有匹配处改为从 `db.ts` 导入 `DB_URL` 或使用 `process.env.MASTRA_DB_URL ?? 'file:./data/mastra.db'`。

- [ ] **Step 7: 删除源码目录和根目录中的数据库文件**

```bash
cd /Users/wenjunjie/Documents/antigravity/jolly-curie
# 删除 src 中的数据库文件
rm -f apps/agent-server/src/mastra/public/mastra.db
rm -f apps/agent-server/src/mastra/public/mastra.db-shm
rm -f apps/agent-server/src/mastra/public/mastra.db-wal
rm -f apps/agent-server/src/mastra/public/mastra.duckdb
rm -f apps/agent-server/src/mastra/public/mastra.duckdb.wal

# 删除根目录的数据库文件
rm -f mastra.db mastra.db-shm mastra.db-wal mastra.duckdb mastra.duckdb.wal

# 如果 public 目录为空则删除
rmdir apps/agent-server/src/mastra/public 2>/dev/null || true
```

- [ ] **Step 8: 更新 `.env.example` — 添加 DB 路径变量**

```bash
# 在 .env.example 末尾添加：

# 数据库路径（可选，默认 ./data/mastra.db）
# MASTRA_DB_URL=file:./data/mastra.db

# Desktop 与 Agent Server 之间的认证 Token（可选，生产打包时使用）
# TRADING_AGENT_DESKTOP_TOKEN=your-secure-token
```

- [ ] **Step 9: 更新 `restart-dev.sh` — 确保 data 目录存在**

在 `restart-dev.sh` 的编译步骤前添加：

```bash
# 确保数据目录存在
mkdir -p data
```

- [ ] **Step 10: 验证编译 + 启动**

```bash
cd /Users/wenjunjie/Documents/antigravity/jolly-curie
npm run build -w @trading-agent/shared
npm run build -w agent-server
npm run dev:agent &
sleep 5
# 确认 data/mastra.db 被创建
ls -la data/
# 确认 API 正常
curl -s http://localhost:4111/api/research/agents | head -20
kill %1
```

- [ ] **Step 11: Commit**

```bash
cd /Users/wenjunjie/Documents/antigravity/jolly-curie
git add apps/agent-server/src/mastra/db.ts apps/agent-server/src/mastra/index.ts apps/agent-server/src/mastra/agents/agent-registry.ts .gitignore .env.example data/.gitkeep
git add -A apps/agent-server/src/mastra/public/  # 记录文件删除
git commit -m "fix(server): move database files to data/ directory, support MASTRA_DB_URL env var"
```

---

### Phase 2: P1 构建编排 + 包名统一 + 包管理器一致

**目标**: 引入 Turborepo 做构建依赖编排，统一包名 scope，消除 pnpm 嵌套。

#### Task 2.1: 引入 Turborepo 构建编排

**Files:**
- Create: `turbo.json` (根目录)
- Modify: `package.json` (根目录)
- Modify: `apps/agent-server/package.json`
- Modify: `apps/desktop/package.json`
- Modify: `packages/shared/package.json`
- Modify: `packages/playground-ui/package.json`

**Problem:** 当前构建依赖链通过 `prebuild` 钩子和 `build` 脚本中的命令串联手动管理。例如 `apps/desktop` 的 `build` 是：
```
"build": "npm run build:shared && npm run build:agent && npm run build:renderer && npm run build:electron"
```
无法做增量构建、并行构建、远程缓存。

- [ ] **Step 1: 安装 Turborepo**

```bash
cd /Users/wenjunjie/Documents/antigravity/jolly-curie
npm install --save-dev turbo@^2.5.0
```

- [ ] **Step 2: 创建 `turbo.json`**

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": [
        "dist/**",
        ".mastra/output/**",
        "dist-electron/**"
      ]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "typecheck": {
      "dependsOn": ["^build"],
      "outputs": []
    },
    "test": {
      "dependsOn": ["^build"],
      "outputs": []
    },
    "test:run": {
      "dependsOn": ["^build"],
      "outputs": []
    },
    "lint": {
      "outputs": []
    }
  }
}
```

- [ ] **Step 3: 更新根 `package.json` scripts**

```json
{
  "scripts": {
    "dev:agent": "npm run dev -w agent-server",
    "dev:renderer": "npm run build -w @mastra/playground-ui && npm run dev:renderer -w trading-agent",
    "dev:studio": "npm run dev:renderer",
    "dev:desktop": "npm run dev -w trading-agent",
    "dev": "npm run start -w trading-agent",
    "start": "npm run start -w trading-agent",
    "build": "turbo run build",
    "build:desktop": "turbo run build --filter=trading-agent",
    "typecheck": "turbo run typecheck",
    "test": "turbo run test",
    "test:run": "turbo run test:run",
    "lint": "turbo run lint",
    "restart": "./restart-dev.sh"
  }
}
```

- [ ] **Step 4: 简化各子包的 build 脚本，移除手动串联**

`apps/agent-server/package.json`:
```json
{
  "scripts": {
    "dev": "mastra dev",
    "typecheck": "tsc --noEmit",
    "build": "npm run typecheck && mastra build",
    "start": "mastra start"
  }
}
```
移除 `"prebuild": "npm run build -w @trading-agent/shared"` — Turborepo 的 `dependsOn: ["^build"]` 会自动处理。

`apps/desktop/package.json`:
```json
{
  "scripts": {
    "dev": "npm run build:electron && electron .",
    "start": "npm run dev",
    "dev:renderer": "vite --host 127.0.0.1 --port 3000",
    "build": "vite build && tsc -p tsconfig.electron.json",
    "build:renderer": "vite build",
    "build:electron": "tsc -p tsconfig.electron.json",
    "build:watch": "tsc -p tsconfig.electron.json --watch --preserveWatchOutput",
    "typecheck": "tsc --noEmit -p tsconfig.vite.json && tsc --noEmit -p tsconfig.electron.json",
    "test": "vitest",
    "test:run": "vitest run",
    "preview": "vite preview --host 127.0.0.1 --port 3000",
    "pack": "npm run build && electron-builder --dir",
    "dist": "npm run build && electron-builder --mac"
  }
}
```
移除 `"build:shared"` 和 `"build:agent"` 脚本及其在 `build` 中的串联 — Turborepo 会先构建 `^build` 依赖。

> **注意**: `apps/desktop/package.json` 的 `build.extraResources` 引用 `../agent-server/.mastra/output`，这意味着 desktop 的完整打包仍需要 agent-server 先构建。Turborepo 的 `dependsOn: ["^build"]` 不覆盖此场景（agent-server 不是 desktop 的 npm 依赖）。解决方案：在根 `package.json` 中保留一个 `build:dist` 脚本：
> ```json
> "build:dist": "turbo run build --filter=agent-server && turbo run build --filter=trading-agent"
> ```

- [ ] **Step 5: 验证 Turborepo 构建**

```bash
cd /Users/wenjunjie/Documents/antigravity/jolly-curie
# 清理旧构建
rm -rf packages/shared/dist apps/agent-server/.mastra/output apps/desktop/dist-electron apps/desktop/dist
# 执行构建
npx turbo run build
```

预期：
- `@trading-agent/shared` 先构建
- `agent-server` 和 `@mastra/playground-ui` 并行构建（都依赖 shared）
- `trading-agent` 最后构建

- [ ] **Step 6: Commit**

```bash
cd /Users/wenjunjie/Documents/antigravity/jolly-curie
git add turbo.json package.json package-lock.json apps/agent-server/package.json apps/desktop/package.json packages/shared/package.json packages/playground-ui/package.json
git commit -m "feat(dx): introduce Turborepo for monorepo build orchestration"
```

---

#### Task 2.2: 统一包名 scope

**Files:**
- Modify: `apps/agent-server/package.json` (`name: "agent-server"` → `"@trading-agent/agent-server"`)
- Modify: `apps/desktop/package.json` (`name: "trading-agent"` → `"@trading-agent/desktop"`)
- Modify: 根 `package.json` (scripts 中的 `-w` 参数)
- Modify: 所有引用旧包名的 `package.json` 中的 `dependencies`
- Modify: `apps/desktop/package.json` 的 `build` 配置（如有引用包名）

**Problem:**
| 包目录 | 当前包名 | 目标包名 |
|--------|---------|---------|
| `apps/agent-server` | `agent-server` | `@trading-agent/agent-server` |
| `apps/desktop` | `trading-agent` | `@trading-agent/desktop` |
| `packages/shared` | `@trading-agent/shared` | `@trading-agent/shared` ✅ |
| `packages/playground-ui` | `@mastra/playground-ui` | `@trading-agent/playground-ui` |

> **注意**: `@mastra/playground-ui` 是从 Mastra 官方 fork 的本地维护版本（version: `38.0.1-trading.0`）。改名为 `@trading-agent/playground-ui` 更准确地表达归属。但这需要修改所有 import 路径。如果改动面太大，可以保留 `@mastra/playground-ui` 不变。

**决策**: 仅统一 `apps/` 下的包名，`packages/playground-ui` 保留 `@mastra/` scope（因为它的 import 路径遍布 desktop renderer 代码，改动量大且风险高）。

- [ ] **Step 1: 重命名 agent-server 包名**

`apps/agent-server/package.json`:
```json
{
  "name": "@trading-agent/agent-server",
  ...
}
```

- [ ] **Step 2: 重命名 desktop 包名**

`apps/desktop/package.json`:
```json
{
  "name": "@trading-agent/desktop",
  "productName": "Trading Agent",
  ...
}
```

- [ ] **Step 3: 更新所有依赖引用**

在 `apps/desktop/package.json` 的 dependencies 中：
```json
"@trading-agent/agent-server": "*"  # 不需要——desktop 不直接依赖 agent-server 的代码
```
实际上 desktop 不在 dependencies 中引用 agent-server，所以只需更新 scripts 中的 `-w` 参数。

- [ ] **Step 4: 更新根 `package.json` 的 scripts**

所有 `npm run ... -w agent-server` → `npm run ... -w @trading-agent/agent-server`
所有 `npm run ... -w trading-agent` → `npm run ... -w @trading-agent/desktop`

```json
{
  "scripts": {
    "dev:agent": "npm run dev -w @trading-agent/agent-server",
    "dev:renderer": "npm run build -w @mastra/playground-ui && npm run dev:renderer -w @trading-agent/desktop",
    "dev:studio": "npm run dev:renderer",
    "dev:desktop": "npm run dev -w @trading-agent/desktop",
    "dev": "npm run start -w @trading-agent/desktop",
    "start": "npm run start -w @trading-agent/desktop",
    "build": "turbo run build",
    "build:desktop": "turbo run build --filter=@trading-agent/desktop",
    "typecheck": "turbo run typecheck",
    "test": "turbo run test",
    "test:run": "turbo run test:run",
    "lint": "turbo run lint",
    "restart": "./restart-dev.sh"
  }
}
```

- [ ] **Step 5: 更新 `apps/desktop/package.json` 中的 scripts 引用**

将 `"build:shared": "npm run build -w @trading-agent/shared"` 和 `"build:agent": "npm run build -w agent-server"` 中的旧名更新。如果已经在 Task 2.1 中移除了这些脚本，则跳过。

- [ ] **Step 6: 更新 Turborepo filter 引用**

根 `package.json` 中的 `"build:desktop": "turbo run build --filter=@trading-agent/desktop"`

- [ ] **Step 7: 更新 `restart-dev.sh` 中的引用**

`restart-dev.sh` 中没有直接引用包名，无需修改。

- [ ] **Step 8: 验证**

```bash
cd /Users/wenjunjie/Documents/antigravity/jolly-curie
npm install  # 更新 workspace 链接
npx turbo run build
```

- [ ] **Step 9: Commit**

```bash
cd /Users/wenjunjie/Documents/antigravity/jolly-curie
git add apps/agent-server/package.json apps/desktop/package.json package.json package-lock.json
git commit -m "refactor: unify workspace package names under @trading-agent/ scope"
```

---

#### Task 2.3: 消除 E2E 目录的 pnpm 嵌套

**Files:**
- Delete: `apps/desktop/e2e/kitchen-sink/pnpm-lock.yaml`
- Delete: `apps/desktop/e2e/kitchen-sink/pnpm-workspace.yaml`
- Modify: `apps/desktop/e2e/kitchen-sink/package.json`

**Problem:** `apps/desktop/e2e/kitchen-sink/` 有自己的 `pnpm-lock.yaml` 和 `pnpm-workspace.yaml`，在 npm workspaces monorepo 中嵌套了 pnpm workspace。包管理器混用容易造成依赖解析不一致。

**Solution:** 将 kitchen-sink 纳入根 npm workspace 管理。

- [ ] **Step 1: 删除 pnpm 配置文件**

```bash
cd /Users/wenjunjie/Documents/antigravity/jolly-curie
rm apps/desktop/e2e/kitchen-sink/pnpm-lock.yaml
rm apps/desktop/e2e/kitchen-sink/pnpm-workspace.yaml
```

- [ ] **Step 2: 更新 kitchen-sink/package.json**

```json
{
  "name": "@trading-agent/e2e-kitchen-sink",
  "type": "module",
  "version": "0.0.1",
  "private": true,
  "scripts": {
    "dev": "mastra dev",
    "build": "mastra build",
    "start": "mastra start"
  },
  "dependencies": {
    "@mastra/core": "latest",
    "@mastra/editor": "latest",
    "@mastra/libsql": "latest",
    "@mastra/loggers": "latest",
    "@mastra/mcp": "latest",
    "@mastra/memory": "latest",
    "ai": "^5.0.196",
    "mastra": "latest",
    "zod": "^4.4.3"
  },
  "devDependencies": {
    "@types/node": "22.19.20",
    "typescript": "^6.0.3"
  }
}
```

移除 `"packageManager": "pnpm@11.5.1"`。统一 TS 版本为 `^6.0.3`。

- [ ] **Step 3: 将 kitchen-sink 纳入根 workspace**

根 `package.json` 的 `workspaces` 已经是 `["apps/*", "packages/*"]`，但 `apps/desktop/e2e/kitchen-sink` 不在 `apps/*` glob 下。需要额外添加：

```json
{
  "workspaces": [
    "apps/*",
    "packages/*",
    "apps/desktop/e2e/kitchen-sink"
  ]
}
```

- [ ] **Step 4: 安装依赖**

```bash
cd /Users/wenjunjie/Documents/antigravity/jolly-curie
npm install
```

- [ ] **Step 5: 验证 kitchen-sink 编译**

```bash
cd /Users/wenjunjie/Documents/antigravity/jolly-curie/apps/desktop/e2e/kitchen-sink
npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 6: Commit**

```bash
cd /Users/wenjunjie/Documents/antigravity/jolly-curie
git add apps/desktop/e2e/kitchen-sink/ package.json package-lock.json
git commit -m "refactor(e2e): migrate kitchen-sink from pnpm to npm workspaces"
```

---

### Phase 3: P2 代码结构优化 + CI/CD

**目标**: 拆分 shared 包，抽取 DB migration，添加 CI/CD pipeline。

#### Task 3.1: 拆分 `packages/shared` 的单文件结构

**Files:**
- Create: `packages/shared/src/schemas/market-data.ts`
- Create: `packages/shared/src/schemas/research-report.ts`
- Create: `packages/shared/src/schemas/agent-config.ts`
- Create: `packages/shared/src/schemas/team-config.ts`
- Create: `packages/shared/src/schemas/news.ts`
- Create: `packages/shared/src/schemas/fundamentals.ts`
- Create: `packages/shared/src/schemas/index.ts`
- Create: `packages/shared/src/types/index.ts`
- Modify: `packages/shared/src/index.ts` (改为 re-export)

**Problem:** 全部 Schema 和 Type 放在一个 329 行的 `index.ts` 中，随着 Schema 增长会越来越难维护。

- [ ] **Step 1: 创建 `schemas/market-data.ts`**

将 `KLineDataSchema`、`IndicatorsSchema`、`TradeSignalSchema`、`PositionSchema` 及对应类型移入。

- [ ] **Step 2: 创建 `schemas/research-report.ts`**

将 `AgentOpinionSchema`、`RiskItemSchema`、`TrackingConditionSchema`、`ResearchReportSchema` 及对应类型移入。需要 import `TradeSignalSchema` from `./market-data`。

- [ ] **Step 3: 创建 `schemas/news.ts`**

将 `NewsArticleSchema`、`NewsSentimentResultSchema` 及对应类型移入。

- [ ] **Step 4: 创建 `schemas/fundamentals.ts`**

将 `FundamentalsSchema` 及对应类型移入。

- [ ] **Step 5: 创建 `schemas/agent-config.ts`**

将 `AgentMetadataSchema`、`AgentConfigSchema`、`AgentTemplateSchema` 及对应类型移入。

- [ ] **Step 6: 创建 `schemas/team-config.ts`**

将 `CollaborationPatternSchema`、`ResearchWorkflowConfigSchema`（deprecated）、`TeamMemberRoleSchema`、`TeamMemberSchema`、`TeamCollaborationConfigSchema`、`AgentTeamConfigSchema`、`TeamExecutionInputSchema`、`TeamExecutionResultSchema`、`AgentTeamTemplateSchema` 及对应类型移入。

- [ ] **Step 7: 创建 `schemas/index.ts` — re-export 所有 schema**

```typescript
export * from './market-data';
export * from './research-report';
export * from './news';
export * from './fundamentals';
export * from './agent-config';
export * from './team-config';
```

- [ ] **Step 8: 创建 `types/index.ts` — re-export 所有类型**

```typescript
export * from '../schemas/market-data';
export * from '../schemas/research-report';
export * from '../schemas/news';
export * from '../schemas/fundamentals';
export * from '../schemas/agent-config';
export * from '../schemas/team-config';
```

- [ ] **Step 9: 简化 `index.ts` 为 re-export**

```typescript
// packages/shared/src/index.ts
// Re-export all schemas and types for backward compatibility.
// New code should import from specific schema files instead.
export * from './schemas';
```

- [ ] **Step 10: 验证编译 + 下游兼容**

```bash
cd /Users/wenjunjie/Documents/antigravity/jolly-curie
npm run build -w @trading-agent/shared
# 验证下游不受影响（所有现有 import 都从 index.ts 导出，re-export 保持兼容）
npx turbo run typecheck
```

- [ ] **Step 11: Commit**

```bash
cd /Users/wenjunjie/Documents/antigravity/jolly-curie
git add packages/shared/src/
git commit -m "refactor(shared): split single-file index.ts into domain-based schema modules"
```

---

#### Task 3.2: 抽取 DB Migration 逻辑

**Files:**
- Create: `apps/agent-server/src/mastra/db-migrations.ts`
- Modify: `apps/agent-server/src/mastra/agents/agent-registry.ts`
- Modify: `apps/agent-server/src/mastra/teams/team-config-store.ts`

**Problem:** `agent-registry.ts` 中的 `ensureTable()` 函数做 DB schema 迁移（建表、加列），混在业务逻辑中。应该抽取为独立的 migration 模块。

- [ ] **Step 1: 创建 `db-migrations.ts`**

```typescript
// apps/agent-server/src/mastra/db-migrations.ts
import type { Client } from '@libsql/client';
import { getDb } from './db';

/**
 * 数据库迁移管理
 *
 * 所有表创建和 schema 变更集中在此模块，
 * 业务模块（agent-registry、team-config-store 等）不应直接执行 DDL。
 */

let migrationsApplied = false;

/** 执行所有数据库迁移（幂等，仅首次调用执行） */
export async function runMigrations(): Promise<void> {
  if (migrationsApplied) return;
  const db = getDb();

  await migrateAgentConfigsTable(db);
  await migrateAgentTeamsTable(db);
  // 未来新增迁移在此添加

  migrationsApplied = true;
}

/** agent_configs 表迁移 */
async function migrateAgentConfigsTable(db: Client): Promise<void> {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS agent_configs (
      id TEXT PRIMARY KEY,
      config TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  const pragma = await db.execute({ sql: `PRAGMA table_info(agent_configs)` });
  const existingCols = new Set(pragma.rows.map(r => (r as any).name));
  const toAdd = [
    { col: 'name', type: 'TEXT' },
    { col: 'description', type: 'TEXT' },
    { col: 'model', type: 'TEXT' },
  ];
  for (const { col, type } of toAdd) {
    if (!existingCols.has(col)) {
      await db.execute({ sql: `ALTER TABLE agent_configs ADD COLUMN ${col} ${type}` });
      await db.execute({ sql: `UPDATE agent_configs SET ${col} = json_extract(config, '$.${col}')` });
    }
  }
}

/** agent_teams 表迁移 */
async function migrateAgentTeamsTable(db: Client): Promise<void> {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS agent_teams (
      id TEXT PRIMARY KEY,
      config TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
}
```

- [ ] **Step 2: 修改 `agent-registry.ts` — 移除 `ensureTable`，改用 `runMigrations`**

```typescript
// 在 initAgentRegistry() 中：
import { runMigrations } from '../db-migrations';

export async function initAgentRegistry(): Promise<void> {
  if (storeInitialized) return;
  await runMigrations();  // 替代原来的 ensureTable()
  await seedDefaults();
  storeInitialized = true;
}
```

删除 `agent-registry.ts` 中的 `ensureTable()` 函数。

- [ ] **Step 3: 修改 `team-config-store.ts` — 同样使用 `runMigrations`**

在 `initTeamConfigStore()` 中调用 `runMigrations()` 替代内联的建表逻辑。

- [ ] **Step 4: 验证编译 + 启动**

```bash
cd /Users/wenjunjie/Documents/antigravity/jolly-curie
npx turbo run build --filter=@trading-agent/agent-server
npm run dev:agent &
sleep 5
curl -s http://localhost:4111/api/research/agents | head -20
kill %1
```

- [ ] **Step 5: Commit**

```bash
cd /Users/wenjunjie/Documents/antigravity/jolly-curie
git add apps/agent-server/src/mastra/db-migrations.ts apps/agent-server/src/mastra/agents/agent-registry.ts apps/agent-server/src/mastra/teams/team-config-store.ts
git commit -m "refactor(server): extract DB migration logic into dedicated module"
```

---

#### Task 3.3: 添加 CI/CD Pipeline

**Files:**
- Create: `.github/workflows/ci.yml`

**Problem:** 没有 CI/CD，所有检查依赖开发者手动运行。至少应配置 typecheck + build + test 的自动化。

- [ ] **Step 1: 创建 GitHub Actions CI 配置**

```yaml
# .github/workflows/ci.yml
name: CI

on:
  push:
    branches: [master, main]
  pull_request:
    branches: [master, main]

jobs:
  build-and-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Typecheck
        run: npm run typecheck

      - name: Build
        run: npm run build
        env:
          DEEPSEEK_API_KEY: dummy-key-for-build-only

      - name: Test
        run: npm run test:run
        env:
          DEEPSEEK_API_KEY: dummy-key-for-build-only
```

> **注意**: `typecheck` 和 `build` 不需要真实的 API key，但 mastra build 可能会在启动时读取环境变量。`DEEPSEEK_API_KEY=dummy-key-for-build-only` 仅用于通过启动检查。

- [ ] **Step 2: 添加 agent-server 的基础测试**

Create: `apps/agent-server/src/mastra/tools/__tests__/technical-analysis-tool.test.ts`

```typescript
import { describe, it, expect } from 'vitest';

// 直接测试纯计算函数（需要从 technical-analysis-tool.ts 导出 sma、ema、rsi、macdCalc）
// 如果这些函数未导出，需要先导出它们

describe('Technical Analysis Tool', () => {
  describe('when calculating SMA', () => {
    it('should compute correct simple moving average', () => {
      // 测试 SMA 计算
    });
  });

  describe('when calculating RSI', () => {
    it('should return 50 for insufficient data', () => {
      // 测试 RSI 边界
    });
  });
});
```

在 `apps/agent-server/package.json` 中添加 vitest：

```json
{
  "scripts": {
    "test": "vitest",
    "test:run": "vitest run"
  },
  "devDependencies": {
    "vitest": "^4.1.9"
  }
}
```

- [ ] **Step 3: Commit**

```bash
cd /Users/wenjunjie/Documents/antigravity/jolly-curie
git add .github/workflows/ci.yml apps/agent-server/src/mastra/tools/__tests__/ apps/agent-server/package.json
git commit -m "feat(dx): add GitHub Actions CI pipeline with typecheck, build, and test"
```

---

### Phase 4: P3 开发体验优化

**目标**: 用 npm scripts 替代 `restart-dev.sh`，优化开发流程。

#### Task 4.1: 用 concurrently 替代 restart-dev.sh

**Files:**
- Modify: `package.json` (根目录)
- Delete: `restart-dev.sh` (可选保留，但内容简化)

**Problem:** `restart-dev.sh` 做了三件事：清理进程、编译 shared、启动 dev。可以用 npm scripts + concurrently 更优雅地实现。

- [ ] **Step 1: 更新根 `package.json` 添加 `dev:all` 脚本**

```json
{
  "scripts": {
    "dev:agent": "npm run dev -w @trading-agent/agent-server",
    "dev:renderer": "npm run build -w @mastra/playground-ui && npm run dev:renderer -w @trading-agent/desktop",
    "dev:studio": "npm run dev:renderer",
    "dev:desktop": "npm run dev -w @trading-agent/desktop",
    "dev": "npm run start -w @trading-agent/desktop",
    "dev:all": "concurrently --kill-others --names \"AGENT,DESKTOP\" --prefix-colors \"cyan,magenta\" \"npm run dev:agent\" \"npm run dev:desktop\"",
    "start": "npm run start -w @trading-agent/desktop",
    "build": "turbo run build",
    "build:desktop": "turbo run build --filter=@trading-agent/desktop",
    "build:dist": "turbo run build --filter=@trading-agent/agent-server && turbo run build --filter=@trading-agent/desktop",
    "typecheck": "turbo run typecheck",
    "test": "turbo run test",
    "test:run": "turbo run test:run",
    "lint": "turbo run lint",
    "kill-ports": "lsof -ti :3000,:4111 | xargs kill -9 2>/dev/null || true",
    "restart": "npm run kill-ports && npm run build -w @trading-agent/shared && npm run dev:all"
  }
}
```

- [ ] **Step 2: 简化 `restart-dev.sh`**

```bash
#!/bin/bash
# 一键重启开发环境
echo "=== Trading Agent 开发环境一键重启 ==="
npm run restart
```

- [ ] **Step 3: 验证**

```bash
cd /Users/wenjunjie/Documents/antigravity/jolly-curie
npm run dev:all
```

预期：同时启动 agent-server 和 desktop，日志带颜色前缀。

- [ ] **Step 4: Commit**

```bash
cd /Users/wenjunjie/Documents/antigravity/jolly-curie
git add package.json restart-dev.sh
git commit -m "feat(dx): add dev:all concurrent script, simplify restart-dev.sh"
```

---

## 四、文件变更清单

### 新增文件（8 个）

| # | 文件路径 | Phase |
|---|---------|-------|
| 1 | `turbo.json` | 2 |
| 2 | `data/.gitkeep` | 1 |
| 3 | `packages/shared/src/schemas/market-data.ts` | 3 |
| 4 | `packages/shared/src/schemas/research-report.ts` | 3 |
| 5 | `packages/shared/src/schemas/agent-config.ts` | 3 |
| 6 | `packages/shared/src/schemas/team-config.ts` | 3 |
| 7 | `packages/shared/src/schemas/news.ts` | 3 |
| 8 | `packages/shared/src/schemas/fundamentals.ts` | 3 |
| 9 | `packages/shared/src/schemas/index.ts` | 3 |
| 10 | `packages/shared/src/types/index.ts` | 3 |
| 11 | `apps/agent-server/src/mastra/db-migrations.ts` | 3 |
| 12 | `apps/agent-server/src/mastra/tools/__tests__/technical-analysis-tool.test.ts` | 3 |
| 13 | `.github/workflows/ci.yml` | 3 |

### 修改文件（12 个）

| # | 文件路径 | Phase | 变更摘要 |
|---|---------|-------|---------|
| 1 | `packages/shared/package.json` | 1 | TS 版本升级到 ^6.0.3 |
| 2 | `apps/agent-server/src/mastra/db.ts` | 1 | 支持环境变量配置 DB 路径 |
| 3 | `apps/agent-server/src/mastra/index.ts` | 1 | storage URL 使用环境变量 |
| 4 | `apps/agent-server/src/mastra/agents/agent-registry.ts` | 1+3 | 导入 DB_URL；移除 ensureTable |
| 5 | `.gitignore` | 1 | 精确数据库文件排除规则 |
| 6 | `.env.example` | 1 | 添加 MASTRA_DB_URL 等变量 |
| 7 | `package.json` (根) | 2+4 | Turborepo scripts + dev:all |
| 8 | `apps/agent-server/package.json` | 2 | 重命名 + 移除 prebuild |
| 9 | `apps/desktop/package.json` | 2 | 重命名 + 简化 build 脚本 |
| 10 | `apps/desktop/e2e/kitchen-sink/package.json` | 2 | 移除 pnpm 配置 + 统一 TS |
| 11 | `packages/shared/src/index.ts` | 3 | 改为 re-export |
| 12 | `apps/agent-server/src/mastra/teams/team-config-store.ts` | 3 | 使用 runMigrations |
| 13 | `restart-dev.sh` | 4 | 简化为 npm run restart |

### 删除文件（8 个）

| # | 文件路径 | Phase | 说明 |
|---|---------|-------|------|
| 1 | `apps/agent-server/src/mastra/public/mastra.db` | 1 | 运行时 DB 文件 |
| 2 | `apps/agent-server/src/mastra/public/mastra.db-shm` | 1 | 运行时 DB 文件 |
| 3 | `apps/agent-server/src/mastra/public/mastra.db-wal` | 1 | 运行时 DB 文件 |
| 4 | `apps/agent-server/src/mastra/public/mastra.duckdb` | 1 | 运行时 DB 文件 |
| 5 | `apps/agent-server/src/mastra/public/mastra.duckdb.wal` | 1 | 运行时 DB 文件 |
| 6 | `mastra.db` (根目录) | 1 | 运行时 DB 文件 |
| 7 | `apps/desktop/e2e/kitchen-sink/pnpm-lock.yaml` | 2 | 消除 pnpm 嵌套 |
| 8 | `apps/desktop/e2e/kitchen-sink/pnpm-workspace.yaml` | 2 | 消除 pnpm 嵌套 |

---

## 五、验收标准

### Phase 1 验收
- [ ] `packages/shared` 使用 TypeScript ^6.0.3，编译通过
- [ ] `npx tsc --noEmit` 在所有 workspace 中通过
- [ ] `apps/agent-server/src/mastra/public/` 目录中无数据库文件
- [ ] 根目录中无 `mastra.db` 等运行时文件
- [ ] `data/` 目录存在且有 `.gitkeep`
- [ ] `MASTRA_DB_URL` 环境变量可覆盖默认 DB 路径
- [ ] `npm run dev:agent` 启动后，`data/mastra.db` 被自动创建
- [ ] `.env.example` 包含 `MASTRA_DB_URL` 和 `TRADING_AGENT_DESKTOP_TOKEN` 说明

### Phase 2 验收
- [ ] `npx turbo run build` 能正确按依赖拓扑排序构建
- [ ] `npx turbo run build` 的输出中，`@trading-agent/shared` 先于 `agent-server` 和 `playground-ui` 构建
- [ ] `apps/agent-server` 的 `package.json` 中 `name` 为 `@trading-agent/agent-server`
- [ ] `apps/desktop` 的 `package.json` 中 `name` 为 `@trading-agent/desktop`
- [ ] `npm run dev:agent` 使用新包名正常工作
- [ ] `apps/desktop/e2e/kitchen-sink/` 中无 `pnpm-lock.yaml` 和 `pnpm-workspace.yaml`
- [ ] `npm install` 在根目录成功安装所有 workspace 依赖

### Phase 3 验收
- [ ] `packages/shared/src/` 下有 `schemas/` 和 `types/` 目录
- [ ] 从 `@trading-agent/shared` 导入的所有现有代码无需修改（re-export 向后兼容）
- [ ] `apps/agent-server/src/mastra/db-migrations.ts` 存在且被 `agent-registry.ts` 和 `team-config-store.ts` 调用
- [ ] `agent-registry.ts` 中无 `ensureTable` 函数
- [ ] `.github/workflows/ci.yml` 存在
- [ ] CI 在 push/PR 时自动运行 typecheck + build + test

### Phase 4 验收
- [ ] `npm run dev:all` 能同时启动 agent-server 和 desktop
- [ ] `npm run restart` 能清理端口、编译 shared、启动 dev:all
- [ ] `restart-dev.sh` 内容简化为调用 `npm run restart`

---

## 六、风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| Turborepo 与 npm workspaces 兼容性问题 | 构建失败 | Turborepo 原生支持 npm workspaces；先在本地验证再提交 |
| 包名重命名导致 workspace 链接断裂 | 依赖找不到 | 重命名后立即 `npm install` 重建链接 |
| DB 路径变更导致现有数据丢失 | Agent 配置丢失 | 迁移前手动复制 `mastra.db` 到 `data/` 目录；或在启动时添加自动迁移逻辑 |
| shared 包拆分后 import 路径断裂 | 编译失败 | `index.ts` 做全量 re-export，保证向后兼容 |
| `kitchen-sink` 依赖版本与根 lockfile 冲突 | 安装失败 | 逐步解决版本冲突，必要时 pin 到具体版本 |
| CI 中 mastra build 需要 API key | 构建失败 | 使用 dummy key；mastra build 应仅编译代码不发起 API 调用 |

---

## 七、执行顺序总结

```
Phase 1 (P0 快速修复)
  Task 1.1 (TS 版本统一) → Task 1.2 (DB 文件迁移)
        ↓
Phase 2 (P1 构建编排 + 包名统一)
  Task 2.1 (Turborepo) → Task 2.2 (包名统一) → Task 2.3 (pnpm 消除)
        ↓
Phase 3 (P2 代码结构 + CI/CD)
  Task 3.1 (shared 拆分) ─┐
  Task 3.2 (DB migration) ┼→ Task 3.3 (CI/CD)
                          ┘
        ↓
Phase 4 (P3 开发体验)
  Task 4.1 (concurrently 替代 restart-dev.sh)
```

> **备注**: Phase 1 和 Phase 2 有依赖关系（Phase 2 的 Turborepo 需要所有包的 TS 版本一致）。Phase 3 的三个 Task 可部分并行。Phase 4 独立，可随时执行。整个计划预计 1-2 天完成。
