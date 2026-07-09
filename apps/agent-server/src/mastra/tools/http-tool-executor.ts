import type { HttpToolConfig } from '@trading-agent/shared';

/** 模板插值: 将 {{input.xxx}} 替换为实际值 */
function interpolate(template: string, input: Record<string, any>): string {
  return template.replace(/\{\{input\.(\w+)\}\}/g, (_, key) => {
    const val = input[key];
    return val !== undefined ? String(val) : '';
  });
}

/** 从嵌套对象中提取路径 (如 "data.result.items") */
function extractPath(obj: any, path: string): any {
  return path.split('.').reduce((acc, key) => acc?.[key], obj);
}

/** 执行 HTTP 请求 */
export async function executeHttpRequest(
  config: HttpToolConfig,
  input: Record<string, any>,
): Promise<any> {
  // 1. 构建 URL (路径参数插值)
  let url = config.url;
  if (config.pathParams) {
    for (const [param, template] of Object.entries(config.pathParams)) {
      url = url.replace(`{${param}}`, encodeURIComponent(interpolate(template, input)));
    }
  }

  // 2. 构建查询参数
  if (config.queryParams) {
    const params = new URLSearchParams();
    for (const [key, template] of Object.entries(config.queryParams)) {
      const value = interpolate(template, input);
      if (value) params.set(key, value);
    }
    const qs = params.toString();
    if (qs) url += `?${qs}`;
  }

  // 3. 构建请求体
  let body: string | undefined;
  const headers: Record<string, string> = { ...config.headers };
  if (config.bodyTemplate) {
    body = interpolate(config.bodyTemplate, input);
    if (!headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }
  }

  // 4. 发送请求
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);

  try {
    const response = await fetch(url, {
      method: config.method,
      headers,
      body,
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(`HTTP ${response.status}: ${errorText.slice(0, 500)}`);
    }

    const contentType = response.headers.get('content-type') || '';
    let data: any;
    if (contentType.includes('application/json')) {
      data = await response.json();
    } else {
      data = await response.text();
    }

    // 5. 提取响应路径
    if (config.responsePath) {
      return extractPath(data, config.responsePath);
    }
    return data;
  } finally {
    clearTimeout(timeout);
  }
}
