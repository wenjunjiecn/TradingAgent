import type { McpToolConfig } from '@trading-agent/shared';

/**
 * 执行 MCP 工具调用
 *
 * 通过 MCP 协议连接远程 MCP Server 并调用指定工具。
 * 当前实现使用 fetch 直接调用 MCP Server 的 HTTP 端点。
 */
export async function executeMcpCall(
  config: McpToolConfig,
  input: Record<string, any>,
): Promise<any> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (config.authToken) {
    headers['Authorization'] = `Bearer ${config.authToken}`;
  }

  // MCP 协议: JSON-RPC 2.0
  const payload = {
    jsonrpc: '2.0',
    id: Date.now(),
    method: 'tools/call',
    params: {
      name: config.remoteToolName,
      arguments: input,
    },
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  try {
    const response = await fetch(config.serverUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`MCP Server HTTP ${response.status}`);
    }

    const result = await response.json();

    // JSON-RPC 错误
    if (result.error) {
      throw new Error(`MCP error: ${result.error.message ?? JSON.stringify(result.error)}`);
    }

    // MCP 工具返回格式: { result: { content: [{ type: "text", text: "..." }] } }
    if (result.result?.content) {
      const textParts = result.result.content
        .filter((c: any) => c.type === 'text')
        .map((c: any) => c.text);
      if (textParts.length === 1) {
        try {
          return JSON.parse(textParts[0]);
        } catch {
          return textParts[0];
        }
      }
      return textParts.length > 0 ? textParts : result.result;
    }

    return result.result ?? result;
  } finally {
    clearTimeout(timeout);
  }
}
