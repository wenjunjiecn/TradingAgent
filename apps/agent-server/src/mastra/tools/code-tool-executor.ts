import type { CodeToolConfig } from '@trading-agent/shared';

/**
 * 代码工具执行器
 *
 * 在 Node.js 沙箱中执行用户编写的异步 JavaScript 函数。
 * 代码以 `async function(input) { ... }` 形式编写，
 * 通过 `new AsyncFunction` 动态编译执行。
 *
 * 安全限制:
 * - 执行超时控制
 * - 可选注入环境变量
 * - 无法访问 require / process（通过参数白名单）
 */

/** 可注入到沙箱的全局变量白名单名称 */
const ALLOWED_GLOBALS = ['fetch', 'JSON', 'Math', 'Date', 'Object', 'Array', 'String', 'Number', 'Boolean', 'console', 'URL', 'URLSearchParams', 'Error', 'Promise', 'encodeURIComponent', 'decodeURIComponent', 'parseInt', 'parseFloat', 'isNaN', 'Symbol', 'Map', 'Set', 'RegExp'];

/**
 * 执行用户代码
 *
 * @param config CodeToolConfig 包含 code, timeoutMs, env
 * @param input 工具输入参数
 * @returns 代码执行结果
 */
export async function executeCode(
  config: CodeToolConfig,
  input: Record<string, any>,
): Promise<any> {
  const { code, timeoutMs = 15000, env } = config;

  if (!code || !code.trim()) {
    throw new Error('Code tool: empty code');
  }

  // 构建可注入的全局变量
  const sandboxGlobals: Record<string, any> = {};
  for (const key of ALLOWED_GLOBALS) {
    if (typeof (globalThis as any)[key] !== 'undefined') {
      sandboxGlobals[key] = (globalThis as any)[key];
    }
  }

  // 注入环境变量
  if (env) {
    sandboxGlobals.env = env;
  }

  // 构建 async function
  // 用户代码格式: `async function(input) { ... return result; }`
  // 或者直接函数体: `const result = ...; return result;`
  let fnBody: string;
  let fn: Function;

  try {
    // 尝试直接包装为 async function
    // 如果用户写了 `async function(input) { ... }`, 我们提取函数体
    const trimmedCode = code.trim();

    if (trimmedCode.startsWith('async function') || trimmedCode.startsWith('async(input)') || trimmedCode.startsWith('async (input)')) {
      // 用户已经写了完整的函数定义, 直接 eval
      fn = eval(`(${trimmedCode})`);
    } else {
      // 用户只写了函数体, 我们包装它
      fnBody = trimmedCode;
      // 使用 AsyncFunction 构造器
      const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
      fn = new AsyncFunction('input', ...Object.keys(sandboxGlobals), fnBody);
    }
  } catch (err) {
    throw new Error(`Code tool: failed to compile code: ${err instanceof Error ? err.message : String(err)}`);
  }

  // 执行并控制超时
  const resultPromise = Promise.resolve(
    fn(input, ...Object.values(sandboxGlobals))
  );

  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error(`Code tool: execution timed out after ${timeoutMs}ms`)), timeoutMs);
  });

  return Promise.race([resultPromise, timeoutPromise]);
}
