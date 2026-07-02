
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { Mastra } from '@mastra/core/mastra';
import { PinoLogger } from '@mastra/loggers';
import { LibSQLStore } from '@mastra/libsql';
import { MastraCompositeStore } from '@mastra/core/storage';
import { LocalFilesystem, Workspace } from '@mastra/core/workspace';
import { Observability, MastraStorageExporter, MastraPlatformExporter, SensitiveDataFilter } from '@mastra/observability';
import { tradingAgent } from './agents/trading-agent';
import { tradingMcpServer } from './mcps/trading-mcp-server';
import { tradingWorkflow } from './workflows/trading-workflow';

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

const workspace = new Workspace({
  id: 'trading-agent-workspace',
  name: 'Trading Agent Workspace',
  filesystem: new LocalFilesystem({
    id: 'trading-agent-files',
    basePath: projectRoot,
    contained: true,
  }),
  bm25: {
    tokenize: {
      removePunctuation: false,
      minLength: 1,
    },
  },
  autoIndexPaths: [
    'docs',
    'apps/agent-server/src/mastra/agents',
    'apps/agent-server/src/mastra/tools',
    'apps/agent-server/src/mastra/workflows',
    'packages/shared/src',
    'skills',
  ],
  skills: ['skills'],
  checkSkillFileMtime: process.env.NODE_ENV !== 'production',
});

await workspace.init();

export const mastra = new Mastra({
  workflows: { tradingWorkflow },
  agents: { tradingAgent },
  mcpServers: { tradingMcpServer },
  workspace,
  storage: new MastraCompositeStore({
    id: 'composite-storage',
    default: new LibSQLStore({
      id: "mastra-storage",
      url: "file:./mastra.db",
    }),
  }),
  server: {
    cors: {
      origin: ['http://localhost:3000', 'http://127.0.0.1:3000'],
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
