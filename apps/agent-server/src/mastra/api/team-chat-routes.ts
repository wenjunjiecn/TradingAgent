import type { ApiRoute } from '@mastra/core/server';
import { streamReportFollowUp, streamTeamChat } from '../teams/team-chat-engine';
import { streamMultiAgentChat } from '../teams/team-multi-stream';
import { agentRuntimeRegistry } from '../agents/agent-runtime-registry';

/**
 * Team Chat 流式 API 路由
 *
 * 暴露 Team Chat 相关的流式端点：
 * - POST /research/reports/:id/follow-up/stream — 报告追问（Phase 0）
 * - POST /research/teams/:id/chat/stream — Supervisor 代理聊天（Phase 1）
 * - POST /research/teams/:id/multi-chat/stream — 多 Agent 可视化流式（Phase 2）
 */

/** SSE 响应头 */
const SSE_HEADERS: Record<string, string> = {
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache',
  'Connection': 'keep-alive',
};

// ── Phase 0: 报告追问流式端点 ──────────────────────────────────────────

const reportFollowUpStreamRoute: ApiRoute = {
  path: '/research/reports/:id/follow-up/stream',
  method: 'POST',
  handler: async (c: any) => {
    try {
      const reportId = c.req.param('id');
      const { message, history } = await c.req.json();

      if (!message) {
        return c.json({ error: 'Message is required' }, 400);
      }

      const stream = await streamReportFollowUp(
        agentRuntimeRegistry as any,
        reportId,
        message,
        history ?? [],
      );

      return new Response(stream, { headers: SSE_HEADERS });
    } catch (error) {
      console.error('[Report Follow-up Stream API] Error:', error);
      const message = error instanceof Error ? error.message : String(error);
      return c.json({ error: message }, 500);
    }
  },
};

// ── Phase 1: Team Chat Supervisor 代理聊天流式端点 ─────────────────────

const teamChatStreamRoute: ApiRoute = {
  path: '/research/teams/:id/chat/stream',
  method: 'POST',
  handler: async (c: any) => {
    try {
      const teamId = c.req.param('id');
      const { message, threadId } = await c.req.json();

      if (!message) {
        return c.json({ error: 'Message is required' }, 400);
      }

      const { stream, agentName } = await streamTeamChat(
        agentRuntimeRegistry as any,
        teamId,
        message,
        threadId,
      );

      return new Response(stream, {
        headers: { ...SSE_HEADERS, 'X-Agent-Name': encodeURIComponent(agentName) },
      });
    } catch (error) {
      console.error('[Team Chat Stream API] Error:', error);
      const message = error instanceof Error ? error.message : String(error);
      return c.json({ error: message }, 500);
    }
  },
};

// ── Phase 2: Team 多 Agent 可视化流式端点 ──────────────────────────────

const teamMultiChatStreamRoute: ApiRoute = {
  path: '/research/teams/:id/multi-chat/stream',
  method: 'POST',
  handler: async (c: any) => {
    try {
      const teamId = c.req.param('id');
      const { message } = await c.req.json();

      if (!message) {
        return c.json({ error: 'Message is required' }, 400);
      }

      const stream = await streamMultiAgentChat(agentRuntimeRegistry as any, teamId, message);

      return new Response(stream, { headers: SSE_HEADERS });
    } catch (error) {
      console.error('[Team Multi Chat Stream API] Error:', error);
      const message = error instanceof Error ? error.message : String(error);
      return c.json({ error: message }, 500);
    }
  },
};

// ── 导出所有 Team Chat 路由 ────────────────────────────────────────────

export const teamChatRoutes: ApiRoute[] = [
  reportFollowUpStreamRoute,
  teamChatStreamRoute,
  teamMultiChatStreamRoute,
];
