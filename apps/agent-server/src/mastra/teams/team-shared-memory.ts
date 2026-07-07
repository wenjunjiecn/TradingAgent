import { Memory } from '@mastra/memory';
import { LibSQLStore } from '@mastra/libsql';

/**
 * 团队级共享 Memory 管理
 *
 * 为启用 sharedMemoryEnabled 的团队创建独立的 Memory 实例，
 * 按 team ID 隔离，跨执行保留上下文。
 */

const DB_URL = 'file:./mastra.db';

const memoryCache = new Map<string, Memory>();

/** 为团队创建/获取共享 Memory 实例 */
export function getTeamSharedMemory(teamId: string): Memory {
  if (!memoryCache.has(teamId)) {
    memoryCache.set(
      teamId,
      new Memory({
        storage: new LibSQLStore({
          id: `team-memory-${teamId}`,
          url: DB_URL,
        }),
        options: {
          lastMessages: 20,
          semanticRecall: false,
        },
      }),
    );
  }
  return memoryCache.get(teamId)!;
}

/** 清除团队共享 Memory（从缓存和数据库中删除） */
export async function clearTeamSharedMemory(teamId: string): Promise<void> {
  // 从缓存中删除
  memoryCache.delete(teamId);

  // TODO: 清除 LibSQL 中该 team 的 memory 数据
  // Mastra Memory 的清除 API 需要根据具体版本确认
  // 目前通过删除缓存来重置 Memory 实例
}

/** 检查团队是否已启用共享 Memory */
export function isTeamSharedMemoryActive(teamId: string): boolean {
  return memoryCache.has(teamId);
}
