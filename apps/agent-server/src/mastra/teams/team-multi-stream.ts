import type { AgentTeamConfig, AgentOpinion, TeamMember } from '@trading-agent/shared';
import { getTeamConfig } from './team-config-store';
import { getAgentConfig } from '../agents/agent-registry';

/**
 * 多 Agent 流式合并引擎
 *
 * 支持按协作模式选择并行（Council/Debate）或串行（Pipeline）流式策略，
 * 将多个 Agent 的流式输出合并为单一 SSE 流。
 */

interface MastraLike {
  getAgent(name: string): any;
}

/** SSE 事件类型 */
interface StreamEvent {
  type:
    | 'agent-start'
    | 'agent-delta'
    | 'agent-end'
    | 'supervisor-start'
    | 'supervisor-delta'
    | 'supervisor-end'
    | 'done'
    | 'error';
  agentId?: string;
  agentName?: string;
  content?: string;
  error?: string;
}

/** 解析 Agent 显示名称：alias > agentConfig.name > agentId */
async function resolveAgentName(member: TeamMember): Promise<string> {
  if (member.alias) return member.alias;
  const config = await getAgentConfig(member.agentId);
  return config?.name ?? member.agentId;
}

/** 将事件编码为 SSE 格式 */
function encodeSSE(event: StreamEvent): Uint8Array {
  const text = `data: ${JSON.stringify(event)}\n\n`;
  return new TextEncoder().encode(text);
}

/**
 * 并行多 Agent 流式聊天（Council/Debate 模式）
 *
 * 所有成员 Agent 同时 stream，合并为单一 SSE 流。
 * 完成后可选触发 Supervisor 汇总。
 */
async function streamParallelAgents(
  mastra: MastraLike,
  teamConfig: AgentTeamConfig,
  message: string,
  options?: { includeSupervisor?: boolean },
): Promise<ReadableStream<Uint8Array>> {
  const members = teamConfig.members;
  const includeSupervisor = options?.includeSupervisor ?? !!teamConfig.supervisorAgentId;

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const opinions: AgentOpinion[] = [];

      try {
        // 并行发起所有 Agent 的 stream
        const streamPromises = members.map(async (member) => {
          const agent = mastra.getAgent(member.agentId);
          if (!agent) {
            controller.enqueue(
              encodeSSE({
                type: 'error',
                agentId: member.agentId,
                error: `Agent "${member.agentId}" not found`,
              }),
            );
            return;
          }

          const agentName = await resolveAgentName(member);
          controller.enqueue(
            encodeSSE({ type: 'agent-start', agentId: member.agentId, agentName }),
          );

          try {
            const streamOpts: Record<string, unknown> = { maxSteps: 5 };
            if (teamConfig.teamInstructions) {
              (streamOpts as any).instructions = teamConfig.teamInstructions;
            }

            const streamResult = await agent.stream(message, streamOpts);

            let fullText = '';
            for await (const chunk of streamResult.textStream) {
              fullText += chunk;
              controller.enqueue(
                encodeSSE({
                  type: 'agent-delta',
                  agentId: member.agentId,
                  agentName,
                  content: chunk,
                }),
              );
            }

            controller.enqueue(
              encodeSSE({ type: 'agent-end', agentId: member.agentId, agentName }),
            );

            opinions.push({
              role: agentName,
              summary: fullText.slice(0, 200),
              details: fullText,
              confidence: 0.5,
            });
          } catch (error) {
            controller.enqueue(
              encodeSSE({
                type: 'error',
                agentId: member.agentId,
                error: error instanceof Error ? error.message : String(error),
              }),
            );
          }
        });

        await Promise.all(streamPromises);

        // Supervisor 汇总
        if (includeSupervisor && teamConfig.supervisorAgentId && opinions.length > 0) {
          const supervisor = mastra.getAgent(teamConfig.supervisorAgentId);
          if (supervisor) {
            const supervisorConfig = await getAgentConfig(teamConfig.supervisorAgentId);
            const supervisorName = supervisorConfig?.name ?? 'Supervisor';
            controller.enqueue(
              encodeSSE({
                type: 'supervisor-start',
                agentId: teamConfig.supervisorAgentId,
                agentName: supervisorName,
              }),
            );

            const summaryPrompt = `请综合以下各成员的分析，给出总结性结论：\n\n${opinions
              .map((o, i) => `### ${i + 1}. ${o.role}\n${o.details}`)
              .join('\n\n')}`;

            const supervisorOpts: Record<string, unknown> = { maxSteps: 8 };
            if (teamConfig.teamInstructions) {
              (supervisorOpts as any).instructions = teamConfig.teamInstructions;
            }

            const streamResult = await supervisor.stream(summaryPrompt, supervisorOpts);

            for await (const chunk of streamResult.textStream) {
              controller.enqueue(
                encodeSSE({
                  type: 'supervisor-delta',
                  agentId: teamConfig.supervisorAgentId,
                  agentName: supervisorName,
                  content: chunk,
                }),
              );
            }

            controller.enqueue(
              encodeSSE({
                type: 'supervisor-end',
                agentId: teamConfig.supervisorAgentId,
                agentName: supervisorName,
              }),
            );
          }
        }

        controller.enqueue(encodeSSE({ type: 'done' }));
      } catch (error) {
        controller.enqueue(
          encodeSSE({
            type: 'error',
            error: error instanceof Error ? error.message : String(error),
          }),
        );
      } finally {
        controller.close();
      }
    },
  });
}

/**
 * 串行多 Agent 流式聊天（Pipeline 模式）
 *
 * Agent 按 order 顺序依次 stream，上游结果注入下游 prompt。
 */
async function streamPipelineAgents(
  mastra: MastraLike,
  teamConfig: AgentTeamConfig,
  message: string,
): Promise<ReadableStream<Uint8Array>> {
  const sortedMembers = [...teamConfig.members].sort((a, b) => a.order - b.order);

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      let accumulatedContext = '';

      try {
        for (const member of sortedMembers) {
          const agent = mastra.getAgent(member.agentId);
          if (!agent) continue;

          const agentName = await resolveAgentName(member);
          controller.enqueue(
            encodeSSE({ type: 'agent-start', agentId: member.agentId, agentName }),
          );

          const prompt = teamConfig.collaboration.passThroughContext
            ? `${message}\n\n## 上游分析结果\n${accumulatedContext}`
            : message;

          const streamOpts: Record<string, unknown> = { maxSteps: 5 };
          if (teamConfig.teamInstructions) {
            (streamOpts as any).instructions = teamConfig.teamInstructions;
          }

          const streamResult = await agent.stream(prompt, streamOpts);

          let fullText = '';
          for await (const chunk of streamResult.textStream) {
            fullText += chunk;
            controller.enqueue(
              encodeSSE({
                type: 'agent-delta',
                agentId: member.agentId,
                agentName,
                content: chunk,
              }),
            );
          }

          controller.enqueue(
            encodeSSE({ type: 'agent-end', agentId: member.agentId, agentName }),
          );

          accumulatedContext = fullText;
        }

        controller.enqueue(encodeSSE({ type: 'done' }));
      } catch (error) {
        controller.enqueue(
          encodeSSE({
            type: 'error',
            error: error instanceof Error ? error.message : String(error),
          }),
        );
      } finally {
        controller.close();
      }
    },
  });
}

/**
 * 根据协作模式选择流式策略
 */
export async function streamMultiAgentChat(
  mastra: MastraLike,
  teamId: string,
  message: string,
): Promise<ReadableStream<Uint8Array>> {
  const teamConfig = await getTeamConfig(teamId);
  if (!teamConfig) throw new Error(`Team "${teamId}" not found`);

  const pattern = teamConfig.collaboration.pattern;

  switch (pattern) {
    case 'council':
    case 'debate':
    case 'hierarchical':
      return streamParallelAgents(mastra, teamConfig, message);

    case 'pipeline':
      return streamPipelineAgents(mastra, teamConfig, message);

    case 'parallel-scan':
      // parallel-scan 在 Chat 模式下降级为 council
      return streamParallelAgents(mastra, teamConfig, message);

    default:
      return streamParallelAgents(mastra, teamConfig, message);
  }
}
