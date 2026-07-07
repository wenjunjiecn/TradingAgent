
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { Mastra } from '@mastra/core/mastra';
import { PinoLogger } from '@mastra/loggers';
import { LibSQLStore } from '@mastra/libsql';
import { MastraCompositeStore } from '@mastra/core/storage';
import { LocalSkillSource, Workspace } from '@mastra/core/workspace';
import { MastraEditor } from '@mastra/editor';
import { Observability, MastraStorageExporter, MastraPlatformExporter, SensitiveDataFilter } from '@mastra/observability';
import type { Middleware } from '@mastra/core/server';
import { createResearchSupervisor } from './agents/research-supervisor';
import { loadAllAgents } from './agents/agent-registry';
import { initTeamConfigStore } from './teams/team-config-store';
import { tradingMcpServer } from './mcps/trading-mcp-server';
import { tradingWorkflow } from './workflows/trading-workflow';
import { researchRoutes } from './api/research-routes';

const DESKTOP_AUTH_HEADER = 'x-trading-agent-token';
const desktopAuthToken = process.env.TRADING_AGENT_DESKTOP_TOKEN;

function findProjectRoot(startDir: string): string {
  let current = resolve(startDir);

  while (true) {
    const packageJsonPath = join(current, 'package.json');

    if (existsSync(packageJsonPath)) {
      try {
        const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as { name?: string };
        if (packageJson.name === 'trading-agent-monorepo') {
          return current;
        }
      } catch {
        // Keep walking up; malformed package.json should not prevent startup.
      }
    }

    const parent = dirname(current);
    if (parent === current) {
      return resolve(process.env.INIT_CWD ?? process.cwd());
    }
    current = parent;
  }
}

const projectRoot = findProjectRoot(process.env.INIT_CWD ?? process.cwd());

const desktopAuthMiddleware: Middleware = {
  path: '*',
  handler: async (c, next) => {
    return next();
  },
};

function resolveCorsOrigin(origin: string): string | null {
  if (origin === 'http://localhost:3000' || origin === 'http://127.0.0.1:3000') {
    return origin;
  }

  if (desktopAuthToken && (origin === 'null' || origin === 'file://')) {
    return origin;
  }

  return null;
}

const workspace = new Workspace({
  id: 'trading-agent-workspace',
  name: 'Trading Agent Workspace',
  skills: ['skills'],
  skillSource: new LocalSkillSource({ basePath: projectRoot }),
  checkSkillFileMtime: process.env.NODE_ENV !== 'production',
});

await workspace.init();

const storage = new MastraCompositeStore({
  id: 'composite-storage',
  default: new LibSQLStore({
    id: 'mastra-storage',
    url: 'file:./mastra.db',
  }),
  editor: new LibSQLStore({
    id: 'mastra-editor-storage',
    url: 'file:./mastra.db',
  }),
});

// ── 动态加载 Agent 配置 ────────────────────────────────────────────────
// 从 DB 加载所有 agent 配置并实例化为 Mastra Agent 对象。
// 首次启动时自动从模板种子化默认投研角色。
const dynamicAgents = await loadAllAgents();

// 初始化 Agent Team 配置存储（含旧数据迁移和种子化）
await initTeamConfigStore();

// 提取 supervisor 所需的 4 个核心子 agent
const supervisorSubAgents: Record<string, any> = {};
for (const key of ['trading-agent', 'market-analysis-agent', 'sentiment-analysis-agent', 'risk-analysis-agent']) {
  if (dynamicAgents[key]) {
    supervisorSubAgents[key] = dynamicAgents[key];
  }
}

// 创建投研总监 Supervisor Agent，注入子 agent 引用
const researchSupervisor = createResearchSupervisor(supervisorSubAgents);

// 合并所有 agent：动态加载的 + supervisor
const allAgents = {
  ...dynamicAgents,
  'research-supervisor': researchSupervisor,
};

export const mastra = new Mastra({
  workflows: { tradingWorkflow },
  agents: allAgents,
  mcpServers: { tradingMcpServer },
  workspace,
  storage,
  editor: new MastraEditor({
    source: 'db',
  }),
  server: {
    middleware: desktopAuthMiddleware,
    apiRoutes: researchRoutes,
    cors: {
      origin: resolveCorsOrigin,
      allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowHeaders: ['Content-Type', 'Authorization', 'x-mastra-client-type', DESKTOP_AUTH_HEADER],
      credentials: true
    }
  },
  logger: new PinoLogger({
    name: 'TradingAgent',
    level: 'info',
  }),
  observability: new Observability({
    configs: {
      default: {
        serviceName: 'trading-agent',
        exporters: [
          new MastraStorageExporter(),
          new MastraPlatformExporter(),
        ],
        spanOutputProcessors: [
          new SensitiveDataFilter(),
        ],
      },
    },
  }),
});
