import type { AgentTeamTemplate } from '@trading-agent/shared';

/**
 * 预置 Agent Team 模板库
 *
 * 每个模板包含完整的团队配置，用户可基于模板创建新团队，
 * 也可从零自定义。新增模板在此数组中追加即可。
 */
export const agentTeamTemplates: AgentTeamTemplate[] = [
  // ── 深度投研组 ──────────────────────────────────────────────────
  {
    id: 'tpl-team-deep-research',
    name: '深度投研组',
    description: '4 个专业投研角色 + 投研总监，圆桌会议模式，产出完整投研报告。',
    members: [
      { agentId: 'trading-agent', role: 'analyst', weight: 1, order: 0 },
      { agentId: 'market-analysis-agent', role: 'analyst', weight: 1, order: 1 },
      { agentId: 'sentiment-analysis-agent', role: 'analyst', weight: 0.8, order: 2 },
      { agentId: 'risk-analysis-agent', role: 'reviewer', weight: 1, order: 3 },
    ],
    supervisorAgentId: 'research-supervisor',
    collaboration: {
      pattern: 'council',
      rounds: 1,
      passThroughContext: true,
    },
    teamInstructions:
      '你是一个深度投研团队的成员。请从你的专业角度分析目标，给出明确的判断和依据。所有分析用中文撰写。',
    outputFormat: 'research-report',
    sharedMemoryEnabled: false,
    defaultTarget: 'AAPL',
    tags: ['投研', '深度分析', '多角色'],
    category: '投研',
  },

  // ── 快速技术扫描小队 ────────────────────────────────────────────
  {
    id: 'tpl-team-quick-scan',
    name: '快速技术扫描小队',
    description: '技术信号 + 风险检查，流水线模式串行分析，快速产出摘要。',
    members: [
      { agentId: 'trading-agent', role: 'analyst', weight: 1, order: 0 },
      { agentId: 'risk-analysis-agent', role: 'reviewer', weight: 1, order: 1 },
    ],
    supervisorAgentId: 'research-supervisor',
    collaboration: {
      pattern: 'pipeline',
      rounds: 1,
      passThroughContext: true,
    },
    teamInstructions:
      '你是快速扫描团队的成员。请简洁、高效地分析目标，突出关键信号和风险，避免冗长描述。',
    outputFormat: 'summary',
    sharedMemoryEnabled: false,
    defaultTarget: 'AAPL',
    tags: ['投研', '快速扫描', '技术分析'],
    category: '投研',
  },

  // ── 多空辩论团 ──────────────────────────────────────────────────
  {
    id: 'tpl-team-debate',
    name: '多空辩论团',
    description: '4 个投研角色分为多空两方对抗辩论，投研总监裁决，适合关键持仓决策。',
    members: [
      { agentId: 'trading-agent', role: 'analyst', weight: 1, side: 'bull', order: 0 },
      { agentId: 'market-analysis-agent', role: 'analyst', weight: 1, side: 'bull', order: 1 },
      { agentId: 'sentiment-analysis-agent', role: 'analyst', weight: 0.8, side: 'bear', order: 2 },
      { agentId: 'risk-analysis-agent', role: 'analyst', weight: 1, side: 'bear', order: 3 },
    ],
    supervisorAgentId: 'research-supervisor',
    collaboration: {
      pattern: 'debate',
      rounds: 2,
      passThroughContext: true,
    },
    teamInstructions:
      '你是一个多空辩论团队的成员。请根据你被分配的阵营（看多/看空），有力地论证你的观点，同时保持专业性。所有分析用中文撰写。',
    outputFormat: 'research-report',
    sharedMemoryEnabled: false,
    defaultTarget: 'AAPL',
    tags: ['投研', '辩论', '多空对抗'],
    category: '投研',
  },
];
