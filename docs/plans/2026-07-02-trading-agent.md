# Trading Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用美股技术指标分析 Agent（对接 Yahoo Finance 免费 API）替换现有的天气示例代码，并优化桌面端开发体验（引入 tsx 热重载 + concurrently 并发启动）。

**Architecture:** `packages/shared` 提供 zod schemas 和 TypeScript 类型。`apps/agent-server` 下新增 `market-data-tool`（获取股票行情）、`technical-analysis-tool`（计算 MA/RSI/MACD）、`trading-agent`（综合分析给出信号）和 `trading-workflow`（完整分析流水线）。`apps/desktop` 使用 `tsc --watch` + `nodemon` 实现热重载，根 `package.json` 用 `concurrently` 同时启动两侧。

**Tech Stack:** TypeScript, Mastra, DeepSeek API, Yahoo Finance v8（免费，无需 API Key）, zod, nodemon, concurrently

## Global Constraints

- Node.js 版本 ≥ 18（支持原生 fetch）
- 保留 DeepSeek 作为 AI 模型：`model: 'deepseek/deepseek-chat'`
- agent-server 使用 ESM（`"type": "module"` 已在其 package.json 中设置）
- Yahoo Finance API 端点：`https://query1.finance.yahoo.com/v8/finance/chart/{symbol}?range={range}&interval=1d`（需设置 User-Agent header 绕过 403）
- 删除全部 weather 示例代码（weather-agent.ts, weather-tool.ts, weather-workflow.ts）

---

## Task 1: 升级 packages/shared — 添加 zod schemas

**Files:**
- Modify: `packages/shared/src/index.ts`
- Modify: `packages/shared/package.json`

**Interfaces:**
- Produces:
  - `KLineDataSchema`, `IndicatorsSchema`, `TradeSignalSchema`, `PositionSchema` (zod objects)
  - TypeScript types via `z.infer<...>`: `KLineData`, `Indicators`, `TradeSignal`, `Position`

- [ ] **Step 1: 安装 zod 到 shared**

```bash
cd /Users/wenjunjie/Documents/antigravity/jolly-curie/packages/shared
npm install zod@^4.4.3
```

预期输出：`added 1 package` 或 `up to date`

- [ ] **Step 2: 重写 packages/shared/src/index.ts**

完整内容（替换整个文件）：

```typescript
import { z } from 'zod';

// ─── Zod Schemas ────────────────────────────────────────────────────
export const KLineDataSchema = z.object({
  time: z.number().describe('Unix timestamp (seconds)'),
  open: z.number(),
  high: z.number(),
  low: z.number(),
  close: z.number(),
  volume: z.number(),
});

export const IndicatorsSchema = z.object({
  ma20: z.number().describe('20-period Simple Moving Average'),
  ma60: z.number().describe('60-period Simple Moving Average'),
  rsi: z.number().describe('14-period RSI (0-100)'),
  macd: z.number().describe('MACD line (EMA12 - EMA26)'),
  macdSignal: z.number().describe('MACD signal line (EMA9 of MACD)'),
  macdHistogram: z.number().describe('MACD histogram (MACD - Signal)'),
});

export const TradeSignalSchema = z.object({
  symbol: z.string().describe('Stock ticker symbol, e.g. AAPL'),
  action: z.enum(['BUY', 'SELL', 'HOLD']),
  price: z.number().describe('Current price at signal generation'),
  timestamp: z.number().describe('Unix timestamp (ms)'),
  reason: z.string().describe('Human-readable analysis explanation in Chinese'),
  indicators: IndicatorsSchema,
});

export const PositionSchema = z.object({
  symbol: z.string(),
  shares: z.number(),
  entryPrice: z.number(),
  currentPrice: z.number(),
  unrealizedPnl: z.number(),
  unrealizedPnlPct: z.number(),
});

// ─── TypeScript Types ────────────────────────────────────────────────
export type KLineData = z.infer<typeof KLineDataSchema>;
export type Indicators = z.infer<typeof IndicatorsSchema>;
export type TradeSignal = z.infer<typeof TradeSignalSchema>;
export type Position = z.infer<typeof PositionSchema>;
```

- [ ] **Step 3: 验证编译**

```bash
cd /Users/wenjunjie/Documents/antigravity/jolly-curie/packages/shared
npx tsc --noEmit
```

预期：无 error 输出

- [ ] **Step 4: Commit**

```bash
cd /Users/wenjunjie/Documents/antigravity/jolly-curie
git add packages/shared/
git commit -m "feat(shared): upgrade to zod schemas with trading types"
```

---

## Task 2: 新建技术指标计算工具

**Files:**
- Create: `apps/agent-server/src/mastra/tools/technical-analysis-tool.ts`

**Interfaces:**
- Consumes: `KLineDataSchema`, `IndicatorsSchema`, `KLineData` from `@trading-agent/shared`
- Produces: `technicalAnalysisTool` (Mastra Tool) — input: `{ klines: KLineData[] }`, output: `Indicators`

- [ ] **Step 1: 创建工具文件**

```typescript
// apps/agent-server/src/mastra/tools/technical-analysis-tool.ts
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { KLineDataSchema, IndicatorsSchema, type KLineData } from '@trading-agent/shared';

/** Simple Moving Average over last `period` closes */
function sma(closes: number[], period: number): number {
  if (closes.length < period) return closes[closes.length - 1] ?? 0;
  const slice = closes.slice(-period);
  return slice.reduce((sum, v) => sum + v, 0) / period;
}

/** Exponential Moving Average — EMA(t) = price*k + EMA(t-1)*(1-k), k=2/(n+1) */
function ema(closes: number[], period: number): number[] {
  const k = 2 / (period + 1);
  const result: number[] = [];
  let prev = closes[0] ?? 0;
  for (const price of closes) {
    const cur = price * k + prev * (1 - k);
    result.push(cur);
    prev = cur;
  }
  return result;
}

/** RSI(14): 100 - 100/(1 + RS), RS = avg_gain / avg_loss */
function rsi(closes: number[], period = 14): number {
  if (closes.length < period + 1) return 50;
  const changes = closes.slice(1).map((v, i) => v - (closes[i] ?? 0));
  const recent = changes.slice(-period);
  const gains = recent.filter(c => c > 0);
  const losses = recent.filter(c => c < 0).map(Math.abs);
  const avgGain = gains.reduce((s, v) => s + v, 0) / period;
  const avgLoss = losses.reduce((s, v) => s + v, 0) / period;
  if (avgLoss === 0) return 100;
  return 100 - 100 / (1 + avgGain / avgLoss);
}

/** MACD = EMA(12) - EMA(26); Signal = EMA(9) of MACD line */
function macdCalc(closes: number[]): { macd: number; signal: number; histogram: number } {
  const ema12 = ema(closes, 12);
  const ema26 = ema(closes, 26);
  const macdLine = ema12.map((v, i) => v - (ema26[i] ?? 0));
  const signalLine = ema(macdLine, 9);
  const last = macdLine.length - 1;
  const macdVal = macdLine[last] ?? 0;
  const signalVal = signalLine[last] ?? 0;
  return { macd: macdVal, signal: signalVal, histogram: macdVal - signalVal };
}

export const technicalAnalysisTool = createTool({
  id: 'technical-analysis',
  description: 'Calculate technical indicators (MA20, MA60, RSI14, MACD) from K-line data. Requires at least 60 bars.',
  inputSchema: z.object({
    klines: z.array(KLineDataSchema).min(20).describe('K-line bars in chronological order (oldest first)'),
  }),
  outputSchema: IndicatorsSchema,
  execute: async ({ klines }: { klines: KLineData[] }) => {
    const closes = klines.map(k => k.close);
    const { macd, signal, histogram } = macdCalc(closes);
    return {
      ma20: sma(closes, 20),
      ma60: sma(closes, Math.min(60, closes.length)),
      rsi: rsi(closes),
      macd,
      macdSignal: signal,
      macdHistogram: histogram,
    };
  },
});
```

- [ ] **Step 2: 验证 TypeScript**

```bash
cd /Users/wenjunjie/Documents/antigravity/jolly-curie/apps/agent-server
npx tsc --noEmit 2>&1 | head -20
```

预期：无 error

- [ ] **Step 3: Commit**

```bash
cd /Users/wenjunjie/Documents/antigravity/jolly-curie
git add apps/agent-server/src/mastra/tools/technical-analysis-tool.ts
git commit -m "feat(tools): add technical analysis tool (MA/RSI/MACD)"
```

---

## Task 3: 新建行情获取工具 `market-data-tool.ts`

**Files:**
- Create: `apps/agent-server/src/mastra/tools/market-data-tool.ts`

**Interfaces:**
- Consumes: `KLineDataSchema`, `KLineData` from `@trading-agent/shared`
- Produces: `marketDataTool` — input: `{ symbol: string, period: '1mo'|'3mo'|'6mo'|'1y' }`, output: `{ symbol: string, latestPrice: number, klines: KLineData[], dataPoints: number }`

- [ ] **Step 1: 创建工具文件**

```typescript
// apps/agent-server/src/mastra/tools/market-data-tool.ts
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { KLineDataSchema, type KLineData } from '@trading-agent/shared';

interface YahooChartResponse {
  chart: {
    result: Array<{
      meta: { regularMarketPrice: number; symbol: string };
      timestamp: number[];
      indicators: {
        quote: Array<{
          open: (number | null)[];
          high: (number | null)[];
          low: (number | null)[];
          close: (number | null)[];
          volume: (number | null)[];
        }>;
      };
    }> | null;
    error: { code: string; description: string } | null;
  };
}

async function fetchYahooChart(symbol: string, range: string): Promise<KLineData[]> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=1d&includePrePost=false`;
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      'Accept': 'application/json',
      'Accept-Language': 'en-US,en;q=0.9',
    },
  });
  if (!response.ok) {
    throw new Error(`Yahoo Finance API error: HTTP ${response.status} for ${symbol}`);
  }
  const data = (await response.json()) as YahooChartResponse;
  if (data.chart.error) {
    throw new Error(`Yahoo Finance error: ${data.chart.error.description}`);
  }
  const result = data.chart.result?.[0];
  if (!result) throw new Error(`No data found for symbol: ${symbol}`);

  const timestamps = result.timestamp;
  const quote = result.indicators.quote[0]!;
  return timestamps
    .map((ts, i): KLineData => ({
      time: ts,
      open: quote.open[i] ?? 0,
      high: quote.high[i] ?? 0,
      low: quote.low[i] ?? 0,
      close: quote.close[i] ?? 0,
      volume: quote.volume[i] ?? 0,
    }))
    .filter(k => k.close > 0);
}

export const marketDataTool = createTool({
  id: 'get-market-data',
  description: 'Fetch historical daily OHLCV K-line data for a US stock from Yahoo Finance (free, no API key needed)',
  inputSchema: z.object({
    symbol: z.string().describe('US stock ticker, e.g. AAPL, TSLA, NVDA, SPY'),
    period: z.enum(['1mo', '3mo', '6mo', '1y']).default('3mo').describe('Historical data range'),
  }),
  outputSchema: z.object({
    symbol: z.string(),
    latestPrice: z.number(),
    klines: z.array(KLineDataSchema),
    dataPoints: z.number(),
  }),
  execute: async ({ symbol, period }: { symbol: string; period: string }) => {
    const upper = symbol.toUpperCase();
    const klines = await fetchYahooChart(upper, period);
    if (klines.length < 20) {
      throw new Error(`Insufficient data for ${upper}: ${klines.length} bars (need ≥ 20)`);
    }
    return {
      symbol: upper,
      latestPrice: klines[klines.length - 1]!.close,
      klines,
      dataPoints: klines.length,
    };
  },
});
```

- [ ] **Step 2: 验证 TypeScript**

```bash
cd /Users/wenjunjie/Documents/antigravity/jolly-curie/apps/agent-server
npx tsc --noEmit 2>&1 | head -20
```

预期：无 error

- [ ] **Step 3: Commit**

```bash
cd /Users/wenjunjie/Documents/antigravity/jolly-curie
git add apps/agent-server/src/mastra/tools/market-data-tool.ts
git commit -m "feat(tools): add Yahoo Finance market data tool"
```

---

## Task 4: 新建 Trading Agent + 替换 Mastra 配置

**Files:**
- Create: `apps/agent-server/src/mastra/agents/trading-agent.ts`
- Modify: `apps/agent-server/src/mastra/index.ts`
- Delete: `apps/agent-server/src/mastra/agents/weather-agent.ts`
- Delete: `apps/agent-server/src/mastra/tools/weather-tool.ts`

**Interfaces:**
- Consumes: `marketDataTool` (Task 3), `technicalAnalysisTool` (Task 2)
- Produces: `tradingAgent` (Mastra Agent)

- [ ] **Step 1: 创建 trading-agent.ts**

```typescript
// apps/agent-server/src/mastra/agents/trading-agent.ts
import { Agent } from '@mastra/core/agent';
import { Memory } from '@mastra/memory';
import { marketDataTool } from '../tools/market-data-tool';
import { technicalAnalysisTool } from '../tools/technical-analysis-tool';

export const tradingAgent = new Agent({
  id: 'trading-agent',
  name: 'Trading Analysis Agent',
  instructions: `你是一名专业的美股技术分析师 AI。

你的职责是帮助用户分析美股的技术面，给出买入（BUY）、卖出（SELL）或持有（HOLD）的交易信号。

## 分析流程
1. 使用 get-market-data 工具获取指定股票的历史 K 线数据（默认使用 3mo 周期）
2. 使用 technical-analysis 工具计算技术指标（MA20/MA60/RSI/MACD）
3. 综合分析后给出结构化的交易信号

## 判断标准
- RSI < 30 且 MACD Histogram 由负转正 → 强买入信号
- RSI > 70 且 MACD Histogram 由正转负 → 强卖出信号
- MA20 > MA60（金叉）且 RSI 在 40-60 → 买入信号
- MA20 < MA60（死叉）且 RSI 在 40-60 → 卖出信号
- 以上条件均不满足 → 持有（HOLD）

## 输出格式
**必须**以如下 JSON 格式输出（包裹在代码块中）：

\`\`\`json
{
  "symbol": "AAPL",
  "action": "BUY",
  "price": 185.20,
  "timestamp": 1751500000000,
  "reason": "RSI(14)=28.5 处于超卖区域，MACD 柱状图由 -0.23 转为 +0.12，多头动能增强，判断为买入信号。",
  "indicators": {
    "ma20": 182.30,
    "ma60": 179.80,
    "rsi": 28.5,
    "macd": 0.12,
    "macdSignal": -0.11,
    "macdHistogram": 0.23
  }
}
\`\`\`

要求：price 和 timestamp 必须来自实际数据，reason 用中文撰写，指标保留 2-4 位小数。`,
  model: 'deepseek/deepseek-chat',
  tools: { marketDataTool, technicalAnalysisTool },
  memory: new Memory(),
});
```

- [ ] **Step 2: 更新 apps/agent-server/src/mastra/index.ts**

将 `tradingWorkflow` 引用暂时注释（因为 Task 5 还没创建），先用空对象占位：

```typescript
import { Mastra } from '@mastra/core/mastra';
import { PinoLogger } from '@mastra/loggers';
import { LibSQLStore } from '@mastra/libsql';
import { DuckDBStore } from "@mastra/duckdb";
import { MastraCompositeStore } from '@mastra/core/storage';
import { Observability, MastraStorageExporter, MastraPlatformExporter, SensitiveDataFilter } from '@mastra/observability';
import { tradingAgent } from './agents/trading-agent';
// trading-workflow 将在 Task 5 中添加

export const mastra = new Mastra({
  workflows: {},
  agents: { tradingAgent },
  storage: new MastraCompositeStore({
    id: 'composite-storage',
    default: new LibSQLStore({
      id: "mastra-storage",
      url: "file:./mastra.db",
    }),
    domains: {
      observability: await new DuckDBStore().getStore('observability'),
    }
  }),
  logger: new PinoLogger({
    name: 'TradingAgent',
    level: 'info',
  }),
  observability: new Observability({
    configs: {
      default: {
        serviceName: 'trading-agent',
        exporters: [
          new MastraStorageExporter(),
          new MastraPlatformExporter(),
        ],
        spanOutputProcessors: [
          new SensitiveDataFilter(),
        ],
      },
    },
  }),
});
```

- [ ] **Step 3: 删除天气示例文件**

```bash
rm /Users/wenjunjie/Documents/antigravity/jolly-curie/apps/agent-server/src/mastra/agents/weather-agent.ts
rm /Users/wenjunjie/Documents/antigravity/jolly-curie/apps/agent-server/src/mastra/tools/weather-tool.ts
```

- [ ] **Step 4: 启动验证**

```bash
cd /Users/wenjunjie/Documents/antigravity/jolly-curie/apps/agent-server
npm run dev
```

在 Studio (http://localhost:4111) → Agents 中确认 `tradingAgent` 出现，可以正常聊天。按 Ctrl+C 停止。

- [ ] **Step 5: Commit**

```bash
cd /Users/wenjunjie/Documents/antigravity/jolly-curie
git add apps/agent-server/src/mastra/
git commit -m "feat(agent): add trading agent, remove weather examples"
```

---

## Task 5: 新建交易分析工作流

**Files:**
- Create: `apps/agent-server/src/mastra/workflows/trading-workflow.ts`
- Modify: `apps/agent-server/src/mastra/index.ts` (添加 workflow 引用)
- Delete: `apps/agent-server/src/mastra/workflows/weather-workflow.ts`

**Interfaces:**
- Consumes: `marketDataTool.execute`, `technicalAnalysisTool.execute`；`tradingAgent` via `mastra.getAgent('tradingAgent')`
- Produces: `tradingWorkflow` — input: `{ symbol: string }`, output: `{ signal: TradeSignal, summary: string }`

- [ ] **Step 1: 创建 trading-workflow.ts**

```typescript
// apps/agent-server/src/mastra/workflows/trading-workflow.ts
import { createStep, createWorkflow } from '@mastra/core/workflows';
import { z } from 'zod';
import { KLineDataSchema, IndicatorsSchema, TradeSignalSchema, type KLineData, type Indicators } from '@trading-agent/shared';
import { marketDataTool } from '../tools/market-data-tool';
import { technicalAnalysisTool } from '../tools/technical-analysis-tool';

// Step 1: 获取行情 K 线数据
const fetchMarketData = createStep({
  id: 'fetch-market-data',
  description: 'Fetch historical K-line data from Yahoo Finance',
  inputSchema: z.object({
    symbol: z.string().describe('US stock ticker, e.g. AAPL'),
  }),
  outputSchema: z.object({
    symbol: z.string(),
    latestPrice: z.number(),
    klines: z.array(KLineDataSchema),
  }),
  execute: async ({ inputData }) => {
    if (!inputData?.symbol) throw new Error('Symbol is required');
    const result = await marketDataTool.execute({ symbol: inputData.symbol, period: '3mo' });
    return { symbol: result.symbol, latestPrice: result.latestPrice, klines: result.klines };
  },
});

// Step 2: 计算技术指标
const computeIndicators = createStep({
  id: 'compute-indicators',
  description: 'Calculate MA20, MA60, RSI, MACD from K-line data',
  inputSchema: z.object({
    symbol: z.string(),
    latestPrice: z.number(),
    klines: z.array(KLineDataSchema),
  }),
  outputSchema: z.object({
    symbol: z.string(),
    latestPrice: z.number(),
    indicators: IndicatorsSchema,
  }),
  execute: async ({ inputData }) => {
    if (!inputData) throw new Error('Input data missing');
    const indicators = await technicalAnalysisTool.execute({ klines: inputData.klines as KLineData[] });
    return { symbol: inputData.symbol, latestPrice: inputData.latestPrice, indicators: indicators as Indicators };
  },
});

// Step 3: Agent 综合分析，生成交易信号
const generateSignal = createStep({
  id: 'generate-signal',
  description: 'Use Trading Agent to produce BUY/SELL/HOLD signal with reasoning',
  inputSchema: z.object({
    symbol: z.string(),
    latestPrice: z.number(),
    indicators: IndicatorsSchema,
  }),
  outputSchema: z.object({
    signal: TradeSignalSchema,
    summary: z.string(),
  }),
  execute: async ({ inputData, mastra }) => {
    if (!inputData) throw new Error('Input data missing');
    const agent = mastra?.getAgent('tradingAgent');
    if (!agent) throw new Error('tradingAgent not found');

    const { symbol, latestPrice, indicators } = inputData;
    const prompt = `请对 ${symbol} 进行技术分析并给出交易信号。

当前数据：
- 最新收盘价：$${latestPrice.toFixed(2)}
- MA20：${indicators.ma20.toFixed(2)}
- MA60：${indicators.ma60.toFixed(2)}
- RSI(14)：${indicators.rsi.toFixed(2)}
- MACD：${indicators.macd.toFixed(4)}
- MACD Signal：${indicators.macdSignal.toFixed(4)}
- MACD Histogram：${indicators.macdHistogram.toFixed(4)}
- 当前时间戳：${Date.now()}

请按照你的分析规则，输出 JSON 格式的交易信号（包裹在 \`\`\`json 代码块中）。`;

    const response = await agent.stream([{ role: 'user', content: prompt }]);
    let text = '';
    for await (const chunk of response.textStream) { text += chunk; }

    const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/) || text.match(/(\{[\s\S]*"action"[\s\S]*\})/);
    if (!jsonMatch?.[1]) throw new Error(`Agent did not return valid JSON. Response was: ${text.slice(0, 200)}`);

    const signal = TradeSignalSchema.parse(JSON.parse(jsonMatch[1]));
    return {
      signal,
      summary: `${symbol} 分析完成：${signal.action} @ $${signal.price.toFixed(2)}。${signal.reason}`,
    };
  },
});

const tradingWorkflow = createWorkflow({
  id: 'trading-workflow',
  inputSchema: z.object({
    symbol: z.string().describe('US stock ticker symbol, e.g. AAPL'),
  }),
  outputSchema: z.object({
    signal: TradeSignalSchema,
    summary: z.string(),
  }),
})
  .then(fetchMarketData)
  .then(computeIndicators)
  .then(generateSignal);

tradingWorkflow.commit();
export { tradingWorkflow };
```

- [ ] **Step 2: 更新 apps/agent-server/src/mastra/index.ts 添加 workflow**

将 `workflows: {}` 改为：

```typescript
import { tradingWorkflow } from './workflows/trading-workflow';
// ... (其他 import 不变)

export const mastra = new Mastra({
  workflows: { tradingWorkflow },
  // ... (其余配置不变)
});
```

- [ ] **Step 3: 删除天气工作流**

```bash
rm /Users/wenjunjie/Documents/antigravity/jolly-curie/apps/agent-server/src/mastra/workflows/weather-workflow.ts
```

- [ ] **Step 4: 验证无 TypeScript 错误**

```bash
cd /Users/wenjunjie/Documents/antigravity/jolly-curie/apps/agent-server
npx tsc --noEmit
```

预期：0 errors

- [ ] **Step 5: 完整功能测试**

```bash
cd /Users/wenjunjie/Documents/antigravity/jolly-curie/apps/agent-server
npm run dev
```

打开 http://localhost:4111：
1. → Workflows → trading-workflow → Execute，输入 `{"symbol":"NVDA"}` → 确认三步全完成
2. → Agents → trading-agent → Chat，输入 `分析一下 AAPL` → 确认返回 JSON 信号

确认后 Ctrl+C。

- [ ] **Step 6: Commit**

```bash
cd /Users/wenjunjie/Documents/antigravity/jolly-curie
git add apps/agent-server/src/mastra/
git commit -m "feat(workflow): add trading analysis workflow (fetch→indicators→signal)"
```

---

## Task 6: 优化开发体验

**Files:**
- Modify: `apps/desktop/package.json`
- Modify: `package.json` (root)

**Problem:** 当前每次改 `main.ts` 都要手动执行 `tsc`，然后 `start` 才能看到效果。

**Solution:** `tsc --watch` 监听 TypeScript 变化自动编译，`nodemon` 监听 `dist/main.js` 变化自动重启 Electron；根目录 `concurrently` 同时启动 agent-server 和 desktop。

- [ ] **Step 1: 安装 desktop 开发依赖**

```bash
cd /Users/wenjunjie/Documents/antigravity/jolly-curie/apps/desktop
npm install --save-dev nodemon@^3.1.0 concurrently@^8.2.2
```

- [ ] **Step 2: 更新 apps/desktop/package.json 的 scripts**

将 `"scripts"` 字段替换为：

```json
"scripts": {
  "build": "tsc",
  "build:watch": "tsc --watch --preserveWatchOutput",
  "prestart": "npm run build",
  "start": "electron .",
  "dev": "concurrently --kill-others \"npm run build:watch\" \"nodemon --watch dist --ext js --delay 500ms --exec \\\"electron .\\\"\"",
  "pack": "electron-builder --dir",
  "dist": "electron-builder --mac"
}
```

- [ ] **Step 3: 更新根 package.json 的 scripts**

将 `"scripts"` 字段替换为：

```json
"scripts": {
  "dev:agent": "npm run dev -w agent-server",
  "dev:desktop": "npm run dev -w trading-agent",
  "dev": "concurrently --kill-others --names \"AGENT,DESKTOP\" --prefix-colors \"cyan,magenta\" \"npm run dev:agent\" \"npm run dev:desktop\"",
  "start": "npm run start -w trading-agent"
}
```

- [ ] **Step 4: 更新 .env.example**

```
# DeepSeek API（必填）
DEEPSEEK_API_KEY=sk-your-deepseek-api-key-here

# Mastra Platform（可选，用于云端观测）
# MASTRA_PLATFORM_ACCESS_TOKEN=your-token
```

- [ ] **Step 5: 验证并发启动**

```bash
cd /Users/wenjunjie/Documents/antigravity/jolly-curie
npm run dev
```

预期：
- `[AGENT]` 前缀（青色）→ Mastra 服务端日志
- `[DESKTOP]` 前缀（品红色）→ TypeScript 编译 + Electron 启动
- Electron 窗口打开，显示加载页后加载 http://localhost:4111

- [ ] **Step 6: Commit**

```bash
cd /Users/wenjunjie/Documents/antigravity/jolly-curie
git add apps/desktop/package.json package.json .env.example
git commit -m "feat(dx): hot-reload dev mode with tsc--watch + nodemon + concurrently"
```

---

## 最终验证清单

- [ ] `npm run dev`（根目录）能同时启动 agent-server 和 desktop，日志带颜色前缀
- [ ] Mastra Studio Agents 列表中只有 `tradingAgent`
- [ ] Mastra Studio Workflows 列表中只有 `trading-workflow`
- [ ] Agent Chat 中输入 `分析 TSLA`，返回包含 JSON 信号的回复
- [ ] Workflow 运行 `{"symbol":"AAPL"}`，三步全部完成，输出包含 `signal.action` 字段
- [ ] 修改 `apps/desktop/src/main.ts` 后，Electron 自动重启（无需手动 tsc）

---

> [!WARNING]
> **Yahoo Finance 限流**：API 偶尔返回 403。工具已设置 User-Agent，通常够用。遇限流请等 1-2 分钟后重试。

> [!NOTE]
> **数据为每日收盘价**：Yahoo Finance 免费接口提供 T+0 或 T+1 数据，不是实时 tick。分析结果反映最近一个交易日的技术面，适合中期趋势判断。
