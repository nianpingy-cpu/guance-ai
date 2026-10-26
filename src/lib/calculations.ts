import type {
  ApprovalHealth,
  AppData,
  ApprovalSnapshot,
  Plan,
  Review,
  ReviewMetrics,
  ChannelMetrics,
  Signal,
  SignalFilters,
  SignalPriority,
  SignalCategory,
} from '@/types/domain';

/* ------------------------------------------------------------------ */
/* Budget                                                              */
/* ------------------------------------------------------------------ */

export function totalPlanCents(plan: Plan): number {
  return plan.channels.reduce((sum, channel) => sum + Math.max(0, channel.budgetCents), 0);
}

export interface BudgetCheck {
  ok: boolean;
  totalCents: number;
  capCents: number;
  remainingCents: number;
  overByCents: number;
  message: string;
}

export function checkPlanBudget(plan: Plan, capCents: number): BudgetCheck {
  const totalCents = totalPlanCents(plan);
  const remainingCents = capCents - totalCents;
  const overByCents = Math.max(0, totalCents - capCents);
  let message = '预算在可用上限内';
  if (totalCents <= 0) message = '方案预算须大于 0 元';
  else if (overByCents > 0) message = `超出企业预算上限 ${(overByCents / 100).toFixed(2)} 元`;
  return {
    ok: totalCents > 0 && overByCents === 0,
    totalCents,
    capCents,
    remainingCents,
    overByCents,
    message,
  };
}

/** Proportional down-scaling used by the "adjust to cap" assistive action. */
export function scaleChannelsToCap(plan: Plan, capCents: number): Plan {
  if (capCents <= 0 || totalPlanCents(plan) === 0) return plan;
  const total = totalPlanCents(plan);
  if (total <= capCents) return plan;
  const scaled = plan.channels.map((channel) => {
    const raw = (channel.budgetCents / total) * capCents;
    return { ...channel, budgetCents: Math.floor(raw / 100) * 100 };
  });
  let remainder = capCents - scaled.reduce((sum, channel) => sum + channel.budgetCents, 0);
  const order = scaled
    .map((channel, index) => ({ index, cents: channel.budgetCents }))
    .sort((a, b) => b.cents - a.cents);
  for (const item of order) {
    if (remainder <= 0) break;
    const step = Math.min(remainder, 100);
    scaled[item.index] = {
      ...scaled[item.index],
      budgetCents: scaled[item.index].budgetCents + step,
    };
    remainder -= step;
  }
  return { ...plan, channels: scaled };
}

/* ------------------------------------------------------------------ */
/* Review metrics                                                      */
/* ------------------------------------------------------------------ */

const safeSpend = (value: number | null | undefined): number | null =>
  value === null || value === undefined ? null : value;

export function computeReviewMetrics(
  plannedCents: number,
  channels: Review['channels'],
): ReviewMetrics {
  const hasSpend =
    channels.length > 0 && channels.every((c) => safeSpend(c.actualSpendCents) !== null);
  const hasImpressions =
    channels.length > 0 && channels.every((c) => safeSpend(c.impressions) !== null);
  const hasClicks = channels.length > 0 && channels.every((c) => safeSpend(c.clicks) !== null);
  const hasLeads = channels.length > 0 && channels.every((c) => safeSpend(c.leads) !== null);

  const actualSpendCents = hasSpend
    ? channels.reduce((sum, c) => sum + (c.actualSpendCents ?? 0), 0)
    : null;
  const impressions = hasImpressions
    ? channels.reduce((sum, c) => sum + (c.impressions ?? 0), 0)
    : null;
  const clicks = hasClicks ? channels.reduce((sum, c) => sum + (c.clicks ?? 0), 0) : null;
  const leads = hasLeads ? channels.reduce((sum, c) => sum + (c.leads ?? 0), 0) : null;

  const ctr = impressions !== null && impressions > 0 && clicks !== null ? clicks / impressions : null;
  const cpcCents =
    actualSpendCents !== null && clicks !== null && clicks > 0
      ? actualSpendCents / clicks
      : null;
  const costPerLeadCents =
    actualSpendCents !== null && leads !== null && leads > 0
      ? actualSpendCents / leads
      : null;
  const clickToLeadRate = clicks !== null && clicks > 0 && leads !== null ? leads / clicks : null;

  return {
    plannedCents,
    actualSpendCents,
    impressions,
    clicks,
    leads,
    ctr,
    cpcCents,
    costPerLeadCents,
    clickToLeadRate,
  };
}

export function computeChannelMetrics(
  channel: string,
  plannedCents: number,
  actual: Review['channels'][number],
): ChannelMetrics {
  const spend = actual?.actualSpendCents ?? null;
  const impressions = actual?.impressions ?? null;
  const clicks = actual?.clicks ?? null;
  const leads = actual?.leads ?? null;
  return {
    channel,
    plannedCents,
    actualSpendCents: spend,
    impressions,
    clicks,
    leads,
    ctr: impressions !== null && impressions > 0 && clicks !== null ? clicks / impressions : null,
    cpcCents: spend !== null && clicks !== null && clicks > 0 ? spend / clicks : null,
    costPerLeadCents:
      spend !== null && leads !== null && leads > 0 ? spend / leads : null,
  };
}

/* ------------------------------------------------------------------ */
/* Fingerprint & approval health                                      */
/* ------------------------------------------------------------------ */

function fnv1a(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function planEvidenceIds(plan: Plan, data: Pick<AppData, 'themes'>): string[] {
  const ids = new Set<string>();
  for (const theme of data.themes) {
    if (plan.evidenceThemeIds.includes(theme.id)) {
      theme.evidenceSignalIds.forEach((id) => ids.add(id));
    }
  }
  return [...ids].sort();
}

export interface EvidenceState {
  content?: string;
  id: string;
  priority: SignalPriority;
  status: Signal['status'];
  relevance: number;
}

export function snapshotEvidence(signals: Signal[], evidenceIds: string[]): EvidenceState[] {
  return signals
    .filter((signal) => evidenceIds.includes(signal.id))
    .map((signal) => ({
      id: signal.id,
      priority: signal.priority,
      status: signal.status,
      relevance: signal.relevance,
      content: JSON.stringify([signal.title, signal.summary, signal.quote, signal.sourceId, signal.impact]),
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

export function buildPlanFingerprint(
  plan: Plan,
  companyBudgetCents: number,
  evidence: EvidenceState[],
): string {
  const canonical = JSON.stringify({
    budget: companyBudgetCents,
    plan: {
      analysisId: plan.analysisId,
      id: plan.id,
      code: plan.code,
      name: plan.name,
      positioning: plan.positioning,
      audience: plan.audience,
      platforms: plan.platforms,
      formats: plan.formats,
      coreMessage: plan.coreMessage,
      timing: plan.timing,
      rationale: plan.rationale,
      constraints: plan.constraints,
      uncertainties: plan.uncertainties,
      channels: plan.channels.map((c) => [c.channel, c.budgetCents]),
      themes: [...plan.evidenceThemeIds].sort(),
    },
    evidence,
  });
  return `fp_${fnv1a(canonical)}`;
}

export function getLatestApproval(
  approvals: ApprovalSnapshot[],
  planId: string,
): ApprovalSnapshot | undefined {
  return approvals
    .map((approval, index) => ({ approval, index }))
    .filter((entry) => entry.approval.planId === planId)
    .sort(
      (a, b) =>
        Date.parse(b.approval.approvedAt) - Date.parse(a.approval.approvedAt) ||
        b.index - a.index,
    )[0]?.approval;
}

export function approvalChangeReasons(
  approval: ApprovalSnapshot,
  data: Pick<AppData, 'company' | 'signals' | 'themes' | 'plans'>,
): string[] {
  const reasons: string[] = [];
  if (approval.companyBudgetCents !== data.company.budgetCents) {
    reasons.push(
      `企业预算由 ${(approval.companyBudgetCents / 100).toFixed(0)} 元调整为 ${(data.company.budgetCents / 100).toFixed(0)} 元`,
    );
  }
  const currentPlan = data.plans.find((plan) => plan.id === approval.planId);
  if (!currentPlan) {
    reasons.push('当前方案已不存在，无法与审批快照匹配');
    return reasons;
  }
  const evidenceIds = planEvidenceIds(currentPlan, data);
  const currentFingerprint = buildPlanFingerprint(
    currentPlan,
    data.company.budgetCents,
    snapshotEvidence(data.signals, evidenceIds),
  );
  if (currentFingerprint !== approval.fingerprint && reasons.length === 0) {
    reasons.push('审批所依据的方案内容或关键情报状态已发生变化');
  }
  const currentEvidenceIds = planEvidenceIds(currentPlan, data);
  const before = approval.evidence ?? [];
  if (
    currentEvidenceIds.length !== before.length ||
    currentEvidenceIds.some((id) => !before.some((item) => item.id === id))
  ) {
    if (reasons.length === 0) reasons.push('审批关联的情报证据集合发生变化');
  }
  return reasons;
}

export function getApprovalHealth(data: AppData): ApprovalHealth {
  if (data.decision.status === 'hold') {
    return { state: 'hold', reason: data.decision.holdReason ?? '本轮暂不投放' };
  }
  if (data.decision.status !== 'approved' || !data.decision.planId) return { state: 'none' };
  const approval = getLatestApproval(data.approvals, data.decision.planId);
  if (!approval) return { state: 'none' };
  const currentPlan = data.plans.find((plan) => plan.id === approval.planId);
  if (!currentPlan) return { state: 'needs-reconfirm', approval, reasons: ['当前方案已不存在'] };
  const evidenceIds = planEvidenceIds(currentPlan, data);
  const currentFingerprint = buildPlanFingerprint(
    currentPlan,
    data.company.budgetCents,
    snapshotEvidence(data.signals, evidenceIds),
  );
  if (currentFingerprint === approval.fingerprint) {
    return { state: 'valid', approval };
  }
  return {
    state: 'needs-reconfirm',
    approval,
    reasons: approvalChangeReasons(approval, data),
  };
}

export function getReviewForApproval(data: AppData, approvalId: string): Review | undefined {
  return data.reviews.find((review) => review.approvalId === approvalId);
}

/* ------------------------------------------------------------------ */
/* Signals                                                             */
/* ------------------------------------------------------------------ */

export const priorityRank: Record<SignalPriority, number> = { high: 3, medium: 2, low: 1 };
export const categoryLabel: Record<SignalCategory, string> = {
  consumer: '消费者',
  competitor: '竞品',
  industry: '行业',
};
export const priorityLabel: Record<SignalPriority, string> = {
  high: '高',
  medium: '中',
  low: '低',
};
export const statusLabel: Record<Signal['status'], string> = {
  verified: '已核实',
  pending: '待核实',
  disputed: '有争议',
  duplicate: '重复',
};

const RANGE_DAYS = { '7d': 7, '14d': 14, '30d': 30 } as const;

export function filterSignals(signals: Signal[], filters: SignalFilters): Signal[] {
  const query = filters.query.trim().toLowerCase();
  const latest = signals.reduce((max, signal) => Math.max(max, Date.parse(signal.capturedAt)), 0);
  const rangeDays = filters.range === 'all' ? null : RANGE_DAYS[filters.range];
  const cutoff = rangeDays === null ? null : latest - (rangeDays - 1) * 86400000;

  return signals
    .filter((signal) => {
      if (query) {
        const haystack = [
          signal.title,
          signal.summary,
          signal.quote,
          signal.impact,
          signal.platform,
          signal.tags.join(' '),
        ]
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      if (filters.platform !== 'all' && signal.platform !== filters.platform) return false;
      if (filters.category !== 'all' && signal.category !== filters.category) return false;
      if (filters.priority !== 'all' && signal.priority !== filters.priority) return false;
      if (filters.status !== 'all' && signal.status !== filters.status) return false;
      if (filters.date && signal.capturedAt.slice(0, 10) !== filters.date) return false;
      if (cutoff !== null && Date.parse(signal.capturedAt) < cutoff) return false;
      return true;
    })
    .sort((a, b) => {
      const rank = priorityRank[b.priority] - priorityRank[a.priority];
      if (rank !== 0) return rank;
      return Date.parse(b.capturedAt) - Date.parse(a.capturedAt);
    });
}

export function signalStats(signals: Signal[]) {
  const platforms = new Map<string, number>();
  signals.forEach((signal) => platforms.set(signal.platform, (platforms.get(signal.platform) ?? 0) + 1));
  return {
    total: signals.length,
    high: signals.filter((s) => s.priority === 'high').length,
    pending: signals.filter((s) => s.status === 'pending').length,
    disputed: signals.filter((s) => s.status === 'disputed').length,
    verified: signals.filter((s) => s.status === 'verified').length,
    duplicate: signals.filter((s) => s.status === 'duplicate').length,
    platforms: [...platforms.entries()]
      .map(([platform, count]) => ({ platform, count }))
      .sort((a, b) => b.count - a.count),
    latest: signals.reduce(
      (latest, signal) => (!latest || Date.parse(signal.capturedAt) > Date.parse(latest) ? signal.capturedAt : latest),
      '',
    ),
  };
}

export function topSignals(signals: Signal[], count = 3): Signal[] {
  return signals
    .filter((signal) => signal.status !== 'duplicate')
    .slice()
    .sort((a, b) => {
      const rank = priorityRank[b.priority] - priorityRank[a.priority];
      if (rank !== 0) return rank;
      if (b.relevance !== a.relevance) return b.relevance - a.relevance;
      return Date.parse(b.capturedAt) - Date.parse(a.capturedAt);
    })
    .slice(0, count);
}

export interface TrendPoint {
  date: string;
  label: string;
  total: number;
  high: number;
  disputed: number;
}

export function signalTrend(signals: Signal[], days = 21): TrendPoint[] {
  if (signals.length === 0) return [];
  const latest = signals.reduce((max, signal) => Math.max(max, Date.parse(signal.capturedAt)), 0);
  const end = new Date(latest);
  const points: TrendPoint[] = [];
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const date = new Date(end.getTime() - offset * 86400000);
    const iso = date.toISOString().slice(0, 10);
    const daySignals = signals.filter((signal) => signal.capturedAt.slice(0, 10) === iso);
    points.push({
      date: iso,
      label: new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit' }).format(date),
      total: daySignals.length,
      high: daySignals.filter((signal) => signal.priority === 'high').length,
      disputed: daySignals.filter((signal) => signal.status === 'disputed').length,
    });
  }
  return points;
}

export function themeSignalMap(data: Pick<AppData, 'signals' | 'themes'>, themeIds: string[]) {
  const ids = new Set(
    data.themes.filter((theme) => themeIds.includes(theme.id)).flatMap((theme) => theme.evidenceSignalIds),
  );
  return data.signals.filter((signal) => ids.has(signal.id));
}

/* ------------------------------------------------------------------ */
/* Campaign progress                                                   */
/* ------------------------------------------------------------------ */

export interface CampaignProgress {
  phase: string;
  phaseDetail: string;
  stages: Array<{ label: string; value: number; hint: string }>;
  nextAction: { label: string; to: string; hint: string };
}

export function campaignProgress(data: AppData): CampaignProgress {
  const health = getApprovalHealth(data);
  const approval = health.state === 'valid' || health.state === 'needs-reconfirm' ? health.approval : null;
  const review = approval ? getReviewForApproval(data, approval.id) : undefined;
  const hasActual = Boolean(
    review?.channels.some(
      (channel) =>
        channel.actualSpendCents !== null ||
        channel.impressions !== null ||
        channel.clicks !== null ||
        channel.leads !== null,
    ),
  );

  const signalsScore = Math.min(100, Math.round((data.signals.length / 20) * 100));
  const decisionScore = health.state === 'valid' ? 100 : health.state === 'needs-reconfirm' ? 55 : 0;
  const reviewScore = hasActual ? 80 : 0;

  let phase = '待确认方案';
  let phaseDetail = '两套候选方案已准备好，等待人工确认。';
  let nextAction = { label: '继续营销决策', to: '/strategy', hint: '比较方案并确认预算' };

  if (health.state === 'hold') {
    phase = '本轮暂不投放';
    phaseDetail = health.reason;
    nextAction = { label: '恢复方案选择', to: '/strategy', hint: '重新比较方案或确认投放' };
  } else if (health.state === 'needs-reconfirm') {
    phase = '待重新确认';
    phaseDetail = '方案依据发生变化，需要重新确认后才能继续。';
    nextAction = { label: '重新确认方案', to: '/strategy', hint: '查看变化并生成新快照' };
  } else if (health.state === 'valid') {
    phase = hasActual ? '执行后复盘中' : '方案已确认';
    phaseDetail = hasActual
      ? '已录入部分渠道实际数据，可继续补充并形成下一轮任务。'
      : '审批快照已保存，等待录入各渠道实际投放数据。';
    nextAction = { label: hasActual ? '查看效果复盘' : '录入投放结果', to: '/review', hint: '更新实际数据与复盘结论' };
  }

  return {
    phase,
    phaseDetail,
    nextAction,
    stages: [
      { label: '企业建档', value: 100, hint: '目标与预算已明确' },
      { label: '情报收集', value: signalsScore, hint: `${data.signals.length} 条信号` },
      { label: '洞察决策', value: decisionScore, hint: approval ? `方案 ${approval.planCode}` : '尚未确认' },
      { label: '效果复盘', value: reviewScore, hint: hasActual ? '已录入实际数据' : '等待实际数据' },
    ],
  };
}
