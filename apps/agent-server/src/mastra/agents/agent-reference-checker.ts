import type { AgentReference } from '@trading-agent/shared';
import { listTeamConfigs } from '../teams/team-config-store';
import { listAgentConfigs } from './agent-registry';

/**
 * Agent 引用关系检查器
 *
 * 在删除 Agent 前检查它被哪些 Team、Agent 或 Workflow 引用，
 * 阻止破坏性删除。
 */

/**
 * 检查指定 Agent 的所有引用关系
 *
 * @param agentId 要检查的 Agent ID
 * @returns 引用列表，如果列表为空则可以安全删除
 */
export async function checkAgentReferences(agentId: string): Promise<AgentReference[]> {
  const refs: AgentReference[] = [];

  // 1. 检查 agent_teams 中的 members 和 supervisorAgentId
  const teams = await listTeamConfigs();
  for (const team of teams) {
    // 检查是否为 Supervisor
    if (team.supervisorAgentId === agentId) {
      refs.push({
        type: 'team-supervisor' as const,
        entityId: team.id,
        entityName: team.name,
        entityUrl: `/teams/${team.id}`,
        isOnlyMember: team.members.length === 0,
      });
    }

    // 检查是否为成员
    const member = team.members.find(m => m.agentId === agentId);
    if (member) {
      const otherMembers = team.members.filter(m => m.agentId !== agentId);
      refs.push({
        type: 'team-member' as const,
        entityId: team.id,
        entityName: team.name,
        entityUrl: `/teams/${team.id}`,
        isOnlyMember: otherMembers.length === 0 && team.supervisorAgentId !== agentId,
      });
    }
  }

  // 2. 检查其他 Agent 的 subAgentIds
  const agents = await listAgentConfigs();
  for (const agent of agents) {
    if (agent.id === agentId) continue;
    if (agent.subAgentIds && agent.subAgentIds.includes(agentId)) {
      refs.push({
        type: 'agent-subagent' as const,
        entityId: agent.id,
        entityName: agent.name,
        entityUrl: `/agents/${agent.id}`,
      });
    }
  }

  return refs;
}

/**
 * 检查是否可以安全删除 Agent
 *
 * @returns { canDelete: boolean, references: AgentReference[] }
 */
export async function canDeleteAgent(agentId: string): Promise<{
  canDelete: boolean;
  references: AgentReference[];
}> {
  const references = await checkAgentReferences(agentId);
  return {
    canDelete: references.length === 0,
    references,
  };
}
