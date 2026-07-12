import type { Agent } from '@mastra/core/agent';
import {
  type AgentConfig,
  type UnifiedAgentEntry,
} from '@trading-agent/shared';
import {
  initAgentRegistry,
  listAgentConfigs,
  getAgentConfig,
  instantiateAgent,
} from './agent-registry';
import { getEnabledToolIds } from '../tools/tool-config-store';

/**
 * Agent 运行时注册中心
 *
 * 替代启动时一次性 loadAllAgents() 的模式。
 * 采用「预加载 + 后台刷新」策略：
 * - getAgent(id): 同步返回缓存中的 Agent 实例（兼容 MastraLike 接口）
 * - invalidateAgent(id): 标记单个 Agent 需要重新实例化
 * - invalidateAll(): 后台异步重新加载所有 Agent，旧缓存保持可用直到新缓存就绪
 *
 * 实现 MastraLike 接口，可直接替代 mastra 实例传给 Team 执行引擎。
 */

interface MastraLike {
  getAgent(name: string): any;
}

class AgentRuntimeRegistry implements MastraLike {
  private cache: Map<string, Agent> = new Map();
  private initialized = false;
  private reloadPromise: Promise<void> | null = null;

  /** 初始化：确保 DB 表和种子数据就绪 */
  async init(): Promise<void> {
    if (this.initialized) return;
    await initAgentRegistry();
    this.initialized = true;
  }

  /**
   * 同步获取 Agent 实例（从缓存）
   *
   * 注意：此方法是同步的，以兼容 MastraLike 接口。
   * 如果缓存中没有该 Agent，返回 undefined。
   * 使用 getAgentAsync() 进行按需加载。
   */
  getAgent(id: string): Agent | undefined {
    return this.cache.get(id);
  }

  /**
   * 异步获取 Agent 实例（按需加载）
   *
   * 如果缓存中有则直接返回，否则从 DB 读取配置并实例化。
   */
  async getAgentAsync(id: string): Promise<Agent | null> {
    if (this.cache.has(id)) {
      return this.cache.get(id)!;
    }

    await this.init();
    const config = await getAgentConfig(id);
    if (!config) {
      return null;
    }

    try {
      // 如果是 supervisor（有 subAgentIds），先加载子 agent
      let subAgents: Record<string, Agent> | undefined;
      if (config.subAgentIds && config.subAgentIds.length > 0) {
        subAgents = {};
        for (const subId of config.subAgentIds) {
          const subAgent = await this.getAgentAsync(subId);
          if (subAgent) {
            subAgents[subId] = subAgent;
          } else {
            console.warn(`[AgentRuntimeRegistry] Sub-agent "${subId}" not found for supervisor "${config.id}"`);
          }
        }
      }

      const agent = await instantiateAgent(config, subAgents);
      this.cache.set(id, agent);
      return agent;
    } catch (error) {
      console.error(`[AgentRuntimeRegistry] Failed to instantiate agent "${id}":`, error);
      return null;
    }
  }

  /**
   * 从已加载的 Agent 映射填充缓存
   *
   * 用于启动时将 loadAllAgents() 的结果同步到注册中心缓存，
   * 避免重复实例化。
   */
  populateFromLoaded(agents: Record<string, Agent>): void {
    for (const [id, agent] of Object.entries(agents)) {
      this.cache.set(id, agent);
    }
    this.initialized = true;
    console.log(`[AgentRuntimeRegistry] Populated ${this.cache.size} agents from preloaded data`);
  }

  /**
   * 预加载所有 Agent 到缓存
   *
   * 在应用启动时调用，避免首次 Run 的延迟。
   */
  async preloadAll(): Promise<void> {
    await this.init();
    const configs = await listAgentConfigs();

    // 第一轮：实例化所有普通 agent（不注入子 agent）
    for (const config of configs) {
      if (this.cache.has(config.id)) continue;
      try {
        const agent = await instantiateAgent(config);
        this.cache.set(config.id, agent);
      } catch (error) {
        console.error(`[AgentRuntimeRegistry] Failed to preload agent "${config.id}":`, error);
      }
    }

    // 第二轮：为有 subAgentIds 的 agent 重新实例化，注入子 agent
    for (const config of configs) {
      if (!config.subAgentIds || config.subAgentIds.length === 0) continue;
      if (!this.cache.has(config.id)) continue;

      const subAgents: Record<string, Agent> = {};
      for (const subId of config.subAgentIds) {
        const subAgent = this.cache.get(subId);
        if (subAgent) {
          subAgents[subId] = subAgent;
        } else {
          console.warn(`[AgentRuntimeRegistry] Sub-agent "${subId}" not found for supervisor "${config.id}"`);
        }
      }

      if (Object.keys(subAgents).length > 0) {
        try {
          const agent = await instantiateAgent(config, subAgents);
          this.cache.set(config.id, agent);
        } catch (error) {
          console.error(`[AgentRuntimeRegistry] Failed to re-instantiate supervisor "${config.id}":`, error);
        }
      }
    }
  }

  /**
   * 重新加载所有 Agent（内部方法）
   *
   * 构建新缓存，完成后原子替换旧缓存。
   * 在重新加载期间，旧缓存保持可用。
   */
  private async reloadAll(): Promise<void> {
    const newCache: Map<string, Agent> = new Map();

    try {
      await this.init();
      const configs = await listAgentConfigs();

      // 第一轮：实例化所有普通 agent
      for (const config of configs) {
        try {
          const agent = await instantiateAgent(config);
          newCache.set(config.id, agent);
        } catch (error) {
          console.error(`[AgentRuntimeRegistry] Failed to reload agent "${config.id}":`, error);
        }
      }

      // 第二轮：为 supervisor 注入子 agent
      for (const config of configs) {
        if (!config.subAgentIds || config.subAgentIds.length === 0) continue;
        if (!newCache.has(config.id)) continue;

        const subAgents: Record<string, Agent> = {};
        for (const subId of config.subAgentIds) {
          const subAgent = newCache.get(subId);
          if (subAgent) {
            subAgents[subId] = subAgent;
          } else {
            console.warn(`[AgentRuntimeRegistry] Sub-agent "${subId}" not found for supervisor "${config.id}"`);
          }
        }

        if (Object.keys(subAgents).length > 0) {
          try {
            const agent = await instantiateAgent(config, subAgents);
            newCache.set(config.id, agent);
          } catch (error) {
            console.error(`[AgentRuntimeRegistry] Failed to re-instantiate supervisor "${config.id}":`, error);
          }
        }
      }

      // 原子替换缓存
      this.cache = newCache;
      console.log(`[AgentRuntimeRegistry] Reloaded ${this.cache.size} agents`);
    } catch (error) {
      console.error('[AgentRuntimeRegistry] Failed to reload all agents:', error);
      // 保持旧缓存不变
    }
  }

  /**
   * 失效单个 Agent 缓存
   *
   * 触发后台重新加载该 Agent。
   * 如果该 Agent 是其他 Agent 的子 agent，也会触发完整重载。
   */
  invalidateAgent(id: string): void {
    // 简化实现：单个 Agent 变更也触发完整重载
    // 因为 supervisor-agent 的依赖关系使得单独重载复杂
    this.invalidateAll();
  }

  /**
   * 失效所有 Agent 缓存 — Tool 或 Agent 配置变更后调用
   *
   * 后台异步重新加载所有 Agent，旧缓存保持可用直到新缓存就绪。
   * 这样不会阻塞 API 响应，同时保证下一次 Run 使用最新配置。
   */
  invalidateAll(): void {
    // 防止并发重载
    if (this.reloadPromise) {
      return;
    }

    this.reloadPromise = this.reloadAll().finally(() => {
      this.reloadPromise = null;
    });
  }

  /**
   * 等待当前重载完成（用于测试）
   */
  async waitForReload(): Promise<void> {
    if (this.reloadPromise) {
      await this.reloadPromise;
    }
  }

  /** 获取所有已缓存的 Agent ID */
  getCachedAgentIds(): string[] {
    return Array.from(this.cache.keys());
  }

  /**
   * 列出所有统一 Agent 条目
   *
   * 读取 agent_configs DB 表，适配为 UnifiedAgentEntry 格式。
   * 包含来源标识和加载状态。
   */
  async listUnifiedAgents(): Promise<UnifiedAgentEntry[]> {
    await this.init();
    const configs = await listAgentConfigs();
    const enabledToolIds = await getEnabledToolIds();

    return configs.map(config => {
      const disabledTools = config.toolIds.filter(id => !enabledToolIds.has(id));

      return {
        id: config.id,
        name: config.name,
        description: config.description,
        model: config.model,
        toolIds: config.toolIds,
        skillIds: config.skillIds ?? [],
        memoryEnabled: config.memoryEnabled,
        metadata: config.metadata,
        source: 'legacy' as const, // 当前都来自 agent_configs，Phase 6 迁移后改为 'stored'
        status: 'available' as const,
        errorMessage: disabledTools.length > 0
          ? `已停用工具: ${disabledTools.join(', ')}`
          : undefined,
        updatedAt: config.updatedAt,
      };
    });
  }

  /**
   * 获取单个统一 Agent 条目
   */
  async getUnifiedAgent(id: string): Promise<UnifiedAgentEntry | null> {
    await this.init();
    const config = await getAgentConfig(id);
    if (!config) return null;

    const enabledToolIds = await getEnabledToolIds();
    const disabledTools = config.toolIds.filter(tId => !enabledToolIds.has(tId));

    return {
      id: config.id,
      name: config.name,
      description: config.description,
      model: config.model,
      toolIds: config.toolIds,
      skillIds: config.skillIds ?? [],
      memoryEnabled: config.memoryEnabled,
      metadata: config.metadata,
      source: 'legacy' as const,
      status: 'available' as const,
      errorMessage: disabledTools.length > 0
        ? `已停用工具: ${disabledTools.join(', ')}`
        : undefined,
      updatedAt: config.updatedAt,
    };
  }

  /**
   * 获取所有可用的 Agent ID 列表
   */
  async listAvailableAgentIds(): Promise<string[]> {
    await this.init();
    const configs = await listAgentConfigs();
    return configs.map(c => c.id);
  }
}

/** 全局单例 */
export const agentRuntimeRegistry = new AgentRuntimeRegistry();
