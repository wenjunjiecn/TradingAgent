import { z } from 'zod';
import {
  AgentOpinionSchema,
  ResearchReportSchema,
  RiskItemSchema,
  TrackingConditionSchema,
  type AgentOpinion,
  type CollaborationPattern,
  type ResearchReport,
  type Indicators,
  type KLineData,
  type TradeSignal,
} from '@trading-agent/shared';
import { getMarketData } from '../tools/market-data-tool';
import { calculateIndicators } from '../tools/technical-analysis-tool';
import { initReportStore, saveReport } from '../reports/report-store';

/**
 * 协作执行引擎
 *
 * 支持多种协作模式，通过 mastra.getAgent() 动态获取 agent 实例并编排调用。
 *
 * 模式:
 * - council:       N 个 agent 并行分析，supervisor 汇总
 * - pipeline:      N 个 agent 串行，上游输出传递给下游
 * - debate:        多空两方对抗，supervisor 裁决
 * - hierarchical:  supervisor 动态委派（Mastra supervisor agent 模式）
 * - parallel-scan: N 个 agent 分别扫描不同标的
 */

// ── 类型定义 ──────────────────────────────────────────────────────────

interface MastraLike {
  getAgent(name: string): any;
}

interface CollaborationInput {
  symbol: string;
  pattern: CollaborationPattern;
  participantAgentIds: string[];
  supervisorAgentId?: string;
  symbols?: string[];
  /** 预取的市场数据（可选，未提供时引擎自动取数） */
  marketData?: {
    latestPrice: number;
    klines: KLineData[];
    indicators: Indicators;
  };
}

// ── 共享工具函数 ──────────────────────────────────────────────────────

function round(value: number, digits: number): number {
  return Number(value.toFixed(digits));
}

function normalizeIndicators(indicators: Indicators): Indicators {
  return {
    ma20: round(indicators.ma20, 2),
    ma60: round(indicators.ma60, 2),
    rsi: round(indicators.rsi, 2),
    macd: round(indicators.macd, 4),
    macdSignal: round(indicators.macdSignal, 4),
    macdHistogram: round(indicators.macdHistogram, 4),
  };
}

function deriveSignal(symbol: string, latestPrice: number, indicators: Indicators): TradeSignal {
  const n = normalizeIndicators(indicators);
  let action: TradeSignal['action'] = 'HOLD';
  let reason = `当前 RSI=${n.rsi}，MA20=${n.ma20}，MA60=${n.ma60}，MACD 柱=${n.macdHistogram}，趋势信号不够一致，暂时维持观望。`;

  if (n.rsi < 30 && n.macdHistogram > 0) {
    action = 'BUY';
    reason = `RSI=${n.rsi} 处于超卖区域，且 MACD 柱=${n.macdHistogram} 转为正值，多头动能改善，判断为买入信号。`;
  } else if (n.rsi > 70 && n.macdHistogram < 0) {
    action = 'SELL';
    reason = `RSI=${n.rsi} 处于超买区域，且 MACD 柱=${n.macdHistogram} 转为负值，动能走弱，判断为卖出信号。`;
  } else if (n.ma20 > n.ma60 && n.rsi >= 40 && n.rsi <= 60) {
    action = 'BUY';
    reason = `MA20=${n.ma20} 高于 MA60=${n.ma60}，中期趋势偏多，RSI=${n.rsi} 未过热，判断为买入信号。`;
  } else if (n.ma20 < n.ma60 && n.rsi >= 40 && n.rsi <= 60) {
    action = 'SELL';
    reason = `MA20=${n.ma20} 低于 MA60=${n.ma60}，中期趋势偏弱，RSI=${n.rsi} 未明显超卖，判断为卖出信号。`;
  }

  return {
    symbol,
    action,
    price: round(latestPrice, 2),
    timestamp: Date.now(),
    reason,
    indicators: n,
  };
}

function buildDataContext(symbol: string, latestPrice: number, indicators: Indicators, klineCount: number): string {
  const n = normalizeIndicators(indicators);
  return `标的: ${symbol}
最新收盘价: $${latestPrice.toFixed(2)}
MA20: ${n.ma20}
MA60: ${n.ma60}
RSI(14): ${n.rsi}
MACD: ${n.macd}
MACD Signal: ${n.macdSignal}
MACD Histogram: ${n.macdHistogram}
数据点数: ${klineCount}`;
}

/** 调用单个 agent 获取结构化 AgentOpinion */
export async function callAgentForOpinion(
  mastra: MastraLike,
  agentId: string,
  prompt: string,
  options?: {
    teamInstructions?: string;
    structuredOutputSchema?: z.ZodType;
  },
): Promise<AgentOpinion> {
  const agent = mastra.getAgent(agentId);
  if (!agent) {
    throw new Error(`Agent "${agentId}" not found`);
  }

  const fullPrompt = [
    options?.teamInstructions && `## 团队指令\n${options.teamInstructions}`,
    prompt,
  ].filter(Boolean).join('\n\n');

  const generateOptions: Record<string, unknown> = { maxSteps: 5 };
  if (options?.structuredOutputSchema) {
    generateOptions.structuredOutput = { schema: options.structuredOutputSchema };
  } else {
    generateOptions.structuredOutput = { schema: AgentOpinionSchema };
  }

  const result = await agent.generate(fullPrompt, generateOptions as any);

  if (result.object) {
    return result.object as AgentOpinion;
  }

  // Fallback: 从文本解析
  if (result.text) {
    const jsonMatch = result.text.match(/```json\s*([\s\S]*?)\s*```/) || result.text.match(/(\{[\s\S]*\})/);
    if (jsonMatch?.[1]) {
      return AgentOpinionSchema.parse(JSON.parse(jsonMatch[1]));
    }
  }

  throw new Error(`Agent "${agentId}" returned no structured output`);
}

/** Supervisor 结构化输出 schema */
export const SupervisorOutputSchema = z.object({
  title: z.string(),
  conclusion: z.string(),
  action: z.enum(['BUY', 'SELL', 'HOLD', 'WATCH']),
  confidence: z.number().min(0).max(1),
  risks: z.array(RiskItemSchema),
  trackingConditions: z.array(TrackingConditionSchema),
});

type SupervisorOutput = z.infer<typeof SupervisorOutputSchema>;

/** 通用 Supervisor 输出 schema（非投研场景） */
export const GenericSupervisorOutputSchema = z.object({
  title: z.string(),
  conclusion: z.string(),
  confidence: z.number().min(0).max(1),
  risks: z.array(RiskItemSchema).optional(),
  trackingConditions: z.array(TrackingConditionSchema).optional(),
});

export type GenericSupervisorOutput = z.infer<typeof GenericSupervisorOutputSchema>;

/** 调用 supervisor 汇总观点 */
export async function callSupervisor(
  mastra: MastraLike,
  supervisorAgentId: string,
  symbol: string,
  latestPrice: number,
  indicators: Indicators,
  opinions: AgentOpinion[],
  extraContext?: string,
): Promise<ResearchReport> {
  const supervisor = mastra.getAgent(supervisorAgentId);
  if (!supervisor) {
    throw new Error(`Supervisor agent "${supervisorAgentId}" not found`);
  }

  const n = normalizeIndicators(indicators);
  const prompt = `请对 ${symbol} 进行投研综合研判，产出结构化投研报告。

当前数据：
- 最新收盘价：$${latestPrice.toFixed(2)}
- MA20：${n.ma20}
- MA60：${n.ma60}
- RSI(14)：${n.rsi}
- MACD：${n.macd}
- MACD Signal：${n.macdSignal}
- MACD Histogram：${n.macdHistogram}

各角色分析结果：
${opinions.map((o, i) => `### ${i + 1}. ${o.role}
- 倾向: ${o.signal ?? '未明确'}
- 信心度: ${o.confidence ?? '未明确'}
- 摘要: ${o.summary}
- 详情: ${o.details}`).join('\n\n')}

${extraContext ? `\n额外上下文:\n${extraContext}\n` : ''}

请基于以上各角色分析，融合各方观点，产出综合投研报告。要求：
1. conclusion 必须融合各方观点，不能只采纳一方判断
2. 如果各方观点矛盾，要在 conclusion 中说明分歧并给出你的综合判断
3. confidence 反映你对综合结论的把握（0-1）
4. risks 至少列出 2 个风险项
5. trackingConditions 至少列出 1-3 个需要持续监控的条件
6. 所有文本内容用中文撰写`;

  const result = await supervisor.generate(prompt, {
    maxSteps: 12,
    structuredOutput: { schema: SupervisorOutputSchema },
  });

  const supervisorOutput = result.object as SupervisorOutput | undefined;
  if (!supervisorOutput) {
    throw new Error('Supervisor returned no structured output');
  }

  const signal = deriveSignal(symbol, latestPrice, indicators);

  return {
    symbol,
    title: supervisorOutput.title,
    date: new Date().toISOString().slice(0, 10),
    price: latestPrice,
    opinions,
    risks: supervisorOutput.risks,
    conclusion: supervisorOutput.conclusion,
    action: supervisorOutput.action,
    confidence: supervisorOutput.confidence,
    trackingConditions: supervisorOutput.trackingConditions,
    signal,
  };
}

/** 规则 fallback 报告 */
export function fallbackReport(
  symbol: string,
  latestPrice: number,
  indicators: Indicators,
  opinions: AgentOpinion[],
): ResearchReport {
  const n = normalizeIndicators(indicators);
  const signal = deriveSignal(symbol, latestPrice, indicators);
  const buyCount = opinions.filter(o => o.signal === 'BUY').length;
  const sellCount = opinions.filter(o => o.signal === 'SELL').length;
  let action: 'BUY' | 'SELL' | 'HOLD' | 'WATCH' = 'HOLD';
  if (buyCount > sellCount && buyCount >= 2) action = 'BUY';
  else if (sellCount > buyCount && sellCount >= 2) action = 'SELL';
  else if (buyCount === sellCount && buyCount > 0) action = 'WATCH';

  return {
    symbol,
    title: `${symbol} 投研分析报告`,
    date: new Date().toISOString().slice(0, 10),
    price: latestPrice,
    opinions,
    risks: [
      { category: '失效条件', description: `MA20 ${n.ma20 > n.ma60 ? '跌破' : '突破'} MA60 时当前判断失效`, severity: 'high' },
      { category: '数据限制', description: '分析基于日线收盘数据，非实时 tick，存在 T+1 延迟', severity: 'medium' },
    ],
    conclusion: `${symbol} 当前价格 $${latestPrice.toFixed(2)}，技术信号 ${signal.action}。综合各方观点，建议 ${action}，信心度一般，需持续跟踪。`,
    action,
    confidence: 0.5,
    trackingConditions: [
      { metric: 'MA20/MA60', threshold: n.ma20 > n.ma60 ? 'MA20 跌破 MA60' : 'MA20 突破 MA60', action: '重新评估趋势方向' },
      { metric: 'RSI', threshold: n.rsi > 70 ? 'RSI 回落至 60 以下' : n.rsi < 30 ? 'RSI 反弹至 40 以上' : 'RSI 突破 70 或跌破 30', action: '关注动量变化' },
    ],
    signal,
  };
}

/** 确保市场数据可用 */
async function ensureMarketData(input: CollaborationInput): Promise<{
  latestPrice: number;
  klines: KLineData[];
  indicators: Indicators;
}> {
  if (input.marketData) {
    return input.marketData;
  }
  const result = await getMarketData(input.symbol, '3mo');
  const indicators = calculateIndicators(result.klines as KLineData[]);
  return {
    latestPrice: result.latestPrice,
    klines: result.klines,
    indicators,
  };
}

// ── 协作模式实现 ──────────────────────────────────────────────────────

/**
 * Council 模式 — 圆桌会议
 *
 * N 个 agent 并行分析同一标的，Supervisor 汇总各方观点。
 */
async function executeCouncil(
  mastra: MastraLike,
  input: CollaborationInput,
  marketData: { latestPrice: number; klines: KLineData[]; indicators: Indicators },
): Promise<ResearchReport> {
  const { symbol } = input;
  const { latestPrice, indicators, klines } = marketData;
  const dataCtx = buildDataContext(symbol, latestPrice, indicators, klines.length);

  // 并行调用所有参与 agent
  const opinions = await Promise.all(
    input.participantAgentIds.map(async (agentId, idx) => {
      try {
        const agent = mastra.getAgent(agentId);
        const agentName = agent?.name ?? `Agent ${idx + 1}`;
        return await callAgentForOpinion(
          mastra,
          agentId,
          `请基于以下数据分析 ${symbol}。\n\n${dataCtx}\n\n请从你的专业角度给出分析观点。`,
        );
      } catch (error) {
        console.warn(`[Council] Agent "${agentId}" failed:`, error instanceof Error ? error.message : String(error));
        return {
          role: agentId,
          summary: `${agentId} 分析失败`,
          details: `Agent 调用失败: ${error instanceof Error ? error.message : String(error)}`,
          signal: 'WATCH' as const,
          confidence: 0.1,
        };
      }
    }),
  );

  // Supervisor 汇总
  if (input.supervisorAgentId) {
    try {
      return await callSupervisor(mastra, input.supervisorAgentId, symbol, latestPrice, indicators, opinions);
    } catch (error) {
      console.warn('[Council] Supervisor failed:', error instanceof Error ? error.message : String(error));
    }
  }

  return fallbackReport(symbol, latestPrice, indicators, opinions);
}

/**
 * Pipeline 模式 — 流水线
 *
 * N 个 agent 串行，上游分析结果传递给下游。
 */
async function executePipeline(
  mastra: MastraLike,
  input: CollaborationInput,
  marketData: { latestPrice: number; klines: KLineData[]; indicators: Indicators },
): Promise<ResearchReport> {
  const { symbol } = input;
  const { latestPrice, indicators, klines } = marketData;
  const dataCtx = buildDataContext(symbol, latestPrice, indicators, klines.length);

  const opinions: AgentOpinion[] = [];
  let upstreamContext = dataCtx;

  // 串行调用每个 agent
  for (const agentId of input.participantAgentIds) {
    try {
      const prompt = `请基于以下信息分析 ${symbol}。\n\n${upstreamContext}\n\n请从你的专业角度给出分析观点。`;

      const agent = mastra.getAgent(agentId);
      const agentName = agent?.name ?? agentId;

      const opinion = await callAgentForOpinion(mastra, agentId, prompt);
      opinions.push(opinion);

      // 将上游分析结果传递给下游
      upstreamContext = `${dataCtx}\n\n## 上游分析结果\n${opinions.map(o => `### ${o.role}\n- 倾向: ${o.signal ?? '未明确'}\n- 摘要: ${o.summary}\n- 详情: ${o.details}`).join('\n\n')}`;
    } catch (error) {
      console.warn(`[Pipeline] Agent "${agentId}" failed:`, error instanceof Error ? error.message : String(error));
      opinions.push({
        role: agentId,
        summary: `${agentId} 分析失败`,
        details: `Agent 调用失败: ${error instanceof Error ? error.message : String(error)}`,
        signal: 'WATCH',
        confidence: 0.1,
      });
    }
  }

  // 最后一个 agent 或 supervisor 汇总
  if (input.supervisorAgentId) {
    try {
      return await callSupervisor(mastra, input.supervisorAgentId, symbol, latestPrice, indicators, opinions);
    } catch (error) {
      console.warn('[Pipeline] Supervisor failed:', error instanceof Error ? error.message : String(error));
    }
  }

  return fallbackReport(symbol, latestPrice, indicators, opinions);
}

/**
 * Debate 模式 — 辩论
 *
 * 前半数 agent 作为多方，后半数作为空方，Supervisor 裁决。
 */
async function executeDebate(
  mastra: MastraLike,
  input: CollaborationInput,
  marketData: { latestPrice: number; klines: KLineData[]; indicators: Indicators },
): Promise<ResearchReport> {
  const { symbol, participantAgentIds } = input;
  const { latestPrice, indicators, klines } = marketData;
  const dataCtx = buildDataContext(symbol, latestPrice, indicators, klines.length);

  const midpoint = Math.ceil(participantAgentIds.length / 2);
  const bullAgentIds = participantAgentIds.slice(0, midpoint);
  const bearAgentIds = participantAgentIds.slice(midpoint);

  // 并行执行多空双方
  const [bullOpinions, bearOpinions] = await Promise.all([
    Promise.all(bullAgentIds.map(async (agentId) => {
      try {
        return await callAgentForOpinion(
          mastra, agentId,
          `请作为看多方分析 ${symbol}，给出看多理由和证据。\n\n${dataCtx}\n\n请从看多角度给出你的分析观点。`,
        );
      } catch {
        return { role: agentId, summary: '看多分析失败', details: 'Agent 调用失败', signal: 'BUY' as const, confidence: 0.1 };
      }
    })),
    Promise.all(bearAgentIds.map(async (agentId) => {
      try {
        return await callAgentForOpinion(
          mastra, agentId,
          `请作为看空方分析 ${symbol}，给出看空理由和风险证据。\n\n${dataCtx}\n\n请从看空角度给出你的分析观点。`,
        );
      } catch {
        return { role: agentId, summary: '看空分析失败', details: 'Agent 调用失败', signal: 'SELL' as const, confidence: 0.1 };
      }
    })),
  ]);

  const allOpinions = [...bullOpinions, ...bearOpinions];

  // Supervisor 裁决
  if (input.supervisorAgentId) {
    try {
      return await callSupervisor(
        mastra, input.supervisorAgentId, symbol, latestPrice, indicators, allOpinions,
        '本次分析采用辩论模式：前半数 agent 为看多方，后半数为空方。请综合裁决多空观点。',
      );
    } catch (error) {
      console.warn('[Debate] Supervisor failed:', error instanceof Error ? error.message : String(error));
    }
  }

  return fallbackReport(symbol, latestPrice, indicators, allOpinions);
}

/**
 * Hierarchical 模式 — 层级委派
 *
 * Supervisor 动态拆解任务并委派子 agent（Mastra supervisor agent 模式）。
 */
async function executeHierarchical(
  mastra: MastraLike,
  input: CollaborationInput,
  marketData: { latestPrice: number; klines: KLineData[]; indicators: Indicators },
): Promise<ResearchReport> {
  const { symbol } = input;
  const { latestPrice, indicators } = marketData;
  const n = normalizeIndicators(indicators);

  const supervisorId = input.supervisorAgentId;
  if (!supervisorId) {
    throw new Error('Hierarchical mode requires a supervisor agent');
  }

  const supervisor = mastra.getAgent(supervisorId);
  if (!supervisor) {
    throw new Error(`Supervisor agent "${supervisorId}" not found`);
  }

  // 使用 supervisor 的 generate 方法，它会自动委派子 agent
  const prompt = `请对 ${symbol} 进行投研分析并产出投研报告。

当前数据：
- 最新收盘价：$${latestPrice.toFixed(2)}
- MA20：${n.ma20}
- MA60：${n.ma60}
- RSI(14)：${n.rsi}
- MACD：${n.macd}
- MACD Signal：${n.macdSignal}
- MACD Histogram：${n.macdHistogram}

请委派你的子 agent 进行分析，然后汇总产出结构化投研报告 JSON。`;

  const result = await supervisor.generate(prompt, {
    maxSteps: 15,
    structuredOutput: { schema: SupervisorOutputSchema },
  });

  const supervisorOutput = result.object as SupervisorOutput | undefined;
  if (!supervisorOutput) {
    throw new Error('Supervisor returned no structured output in hierarchical mode');
  }

  const signal = deriveSignal(symbol, latestPrice, indicators);

  return {
    symbol,
    title: supervisorOutput.title,
    date: new Date().toISOString().slice(0, 10),
    price: latestPrice,
    opinions: supervisorOutput.risks.length > 0
      ? [{ role: '投研总监（层级委派）', summary: supervisorOutput.title, details: supervisorOutput.conclusion, signal: supervisorOutput.action, confidence: supervisorOutput.confidence }]
      : [],
    risks: supervisorOutput.risks,
    conclusion: supervisorOutput.conclusion,
    action: supervisorOutput.action,
    confidence: supervisorOutput.confidence,
    trackingConditions: supervisorOutput.trackingConditions,
    signal,
  };
}

/**
 * Parallel Scan 模式 — 并行扫描
 *
 * N 个 agent 分别扫描不同标的，返回多份报告。
 */
async function executeParallelScan(
  mastra: MastraLike,
  input: CollaborationInput,
): Promise<ResearchReport[]> {
  const symbols = input.symbols ?? [input.symbol];
  const agentIds = input.participantAgentIds;

  // 对每个标的，用第一个 agent 快速扫描
  const reports = await Promise.all(
    symbols.map(async (symbol) => {
      try {
        const result = await getMarketData(symbol, '3mo');
        const indicators = calculateIndicators(result.klines as KLineData[]);
        const marketData = { latestPrice: result.latestPrice, klines: result.klines, indicators };

        // 使用 Council 模式对该标的进行分析
        return await executeCouncil(mastra, {
          ...input,
          symbol,
          marketData,
        }, marketData);
      } catch (error) {
        console.warn(`[ParallelScan] Failed for ${symbol}:`, error instanceof Error ? error.message : String(error));
        // 返回一个空报告
        return fallbackReport(symbol, 0, { ma20: 0, ma60: 0, rsi: 50, macd: 0, macdSignal: 0, macdHistogram: 0 }, []);
      }
    }),
  );

  return reports;
}

// ── 主入口 ────────────────────────────────────────────────────────────

/**
 * 执行协作分析
 *
 * 根据指定的协作模式编排 agent 调用，产出投研报告。
 */
export async function executeCollaboration(
  mastra: MastraLike,
  input: CollaborationInput,
): Promise<ResearchReport | ResearchReport[]> {
  // 确保报告表已初始化
  await initReportStore();

  // 并行扫描模式返回多份报告
  if (input.pattern === 'parallel-scan') {
    const reports = await executeParallelScan(mastra, input);
    // 保存所有报告
    const savedReports = await Promise.all(
      reports.map(r => {
        const reportWithPattern = { ...r, pattern: input.pattern };
        return saveReport(reportWithPattern);
      }),
    );
    return savedReports;
  }

  // 其他模式需要市场数据
  const marketData = await ensureMarketData(input);

  let report: ResearchReport;
  switch (input.pattern) {
    case 'council':
      report = await executeCouncil(mastra, input, marketData);
      break;
    case 'pipeline':
      report = await executePipeline(mastra, input, marketData);
      break;
    case 'debate':
      report = await executeDebate(mastra, input, marketData);
      break;
    case 'hierarchical':
      report = await executeHierarchical(mastra, input, marketData);
      break;
    default:
      throw new Error(`Unknown collaboration pattern: ${input.pattern}`);
  }

  // 添加 pattern 字段并保存报告
  const reportWithPattern = { ...report, pattern: input.pattern };
  const savedReport = await saveReport(reportWithPattern);

  return savedReport;
}
