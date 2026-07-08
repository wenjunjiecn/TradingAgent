import { createClient, type Client } from '@libsql/client';
import { existsSync, readFileSync, mkdirSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { homedir } from 'node:os';

/**
 * 查找 monorepo 根目录（向上遍历直到找到 trading-agent-monorepo）
 */
export function findProjectRoot(startDir: string): string {
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

/**
 * 共享数据库客户端
 *
 * 所有 store 模块共用一个 LibSQL 连接，避免多个独立连接的：
 * - 重复连接建立开销
 * - 各自独立的 page cache（无法共享）
 * - 并发写时的 lock 竞争
 *
 * DB 路径通过环境变量 MASTRA_DB_URL 配置，
 * 默认为 file:~/.trading-agent/mastra.db（用户主目录下，跨项目共享数据）。
 */
const DATA_DIR = join(homedir(), '.trading-agent');

function resolveDbUrl(): string {
  const envUrl = process.env.MASTRA_DB_URL;
  if (envUrl) return envUrl;

  // 默认路径：用户主目录下 ~/.trading-agent/mastra.db
  return `file:${join(DATA_DIR, 'mastra.db')}`;
}

const DB_URL = resolveDbUrl();

// 确保数据目录存在（仅对 file: 协议生效）
if (DB_URL.startsWith('file:')) {
  const dbPath = DB_URL.slice('file:'.length);
  mkdirSync(dirname(dbPath), { recursive: true });
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
