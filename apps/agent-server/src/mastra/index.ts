import { Mastra } from '@mastra/core/mastra';
import { join, resolve } from 'node:path';
import { PinoLogger } from '@mastra/loggers';
import { LibSQLStore } from '@mastra/libsql';
import { MastraCompositeStore } from '@mastra/core/storage';
import { LocalSkillSource, Workspace } from '@mastra/core/workspace';
import { MastraEditor } from '@mastra/editor';
import { Observability, MastraStorageExporter, MastraPlatformExporter, SensitiveDataFilter } from '@mastra/observability';
import { loadAllAgents } from './agents/agent-registry';
import { agentRuntimeRegistry } from './agents/agent-runtime-registry';
import { initTeamConfigStore } from './teams/team-config-store';
import { findProjectRoot, DB_URL } from './db';
import { tradingMcpServer } from './mcps/trading-mcp-server';
import { tradingWorkflow } from './workflows/trading-workflow';
import { researchRoutes } from './api/research-routes';
import { settingsRoutes } from './api/settings-routes';
import { migrationRoutes } from './api/migration-routes';
import { setWorkspace } from './workspace-instance';

const projectRoot = findProjectRoot(process.env.INIT_CWD ?? process.cwd());

function resolveCorsOrigin(origin: string): string | null {
  if (origin === 'http://localhost:3000' || origin === 'http://127.0.0.1:3000') {
    return origin;
  }

  // Allow Electron file:// and null origins (production desktop app)
  if (origin === 'null' || origin === 'file://') {
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

// 将 Workspace 实例注入到全局持有者，供 agent-runtime-registry 和 agent-registry 使用
setWorkspace(workspace);

const storage = new MastraCompositeStore({
  id: 'composite-storage',
  default: new LibSQLStore({
    id: 'mastra-storage',
    url: DB_URL,
  }),
  editor: new LibSQLStore({
    id: 'mastra-editor-storage',
    url: DB_URL,
  }),
});

// ── 动态加载 Agent 配置 + Team 配置（并行初始化以加速启动） ────────────────
// loadAllAgents 和 initTeamConfigStore 操作不同的表，无依赖关系，可并行执行。
// workspace.init() 也已在上方完成，下方并行启动 DB 相关初始化。
//
// AgentRuntimeRegistry 采用「预加载 + 后台刷新」策略：
// - 启动时通过 loadAllAgents() 预加载所有 Agent（同时填充 Mastra 和 Registry 缓存）
// - Tool/Agent 配置变更后通过 invalidateAll() 后台异步重新加载
// - 旧缓存保持可用直到新缓存就绪，不阻塞 API 响应
const [allAgents] = await Promise.all([
  loadAllAgents(),
  initTeamConfigStore(),
]);

// 将启动时加载的 Agent 同步填充到 RuntimeRegistry 缓存
// 避免重复实例化，同时保留热更新能力
agentRuntimeRegistry.populateFromLoaded(allAgents);

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
    apiRoutes: [...researchRoutes, ...settingsRoutes, ...migrationRoutes],
    cors: {
      origin: resolveCorsOrigin,
      allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowHeaders: ['Content-Type', 'Authorization', 'x-mastra-client-type'],
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
