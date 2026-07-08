import { createClient, type Client } from '@libsql/client';

/**
 * 共享数据库客户端
 *
 * 所有 store 模块共用一个 LibSQL 连接，避免多个独立连接的：
 * - 重复连接建立开销
 * - 各自独立的 page cache（无法共享）
 * - 并发写时的 lock 竞争
 */
const DB_URL = 'file:./mastra.db';

let sharedClient: Client | null = null;

/** 获取共享数据库客户端（单例） */
export function getDb(): Client {
  if (!sharedClient) {
    sharedClient = createClient({ url: DB_URL });
  }
  return sharedClient;
}
