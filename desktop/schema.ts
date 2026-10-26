import { z } from 'zod';
import type { AppData } from '../src/types/domain';
import { buildPlanFingerprint, checkPlanBudget } from '../src/lib/calculations';

const str = z.string().max(200_000);
const id = z.string().min(1).max(200);
const amount = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const strings = z.array(str).max(10_000);
const category = z.enum(['consumer', 'competitor', 'industry']);
const priority = z.enum(['high', 'medium', 'low']);
const status = z.enum(['verified', 'pending', 'disputed', 'duplicate']);
const channel = z.object({ channel: id, budgetCents: amount, role: str });
export const planSchema = z.object({
  analysisId: id.optional(),
  id, code: z.enum(['A', 'B']), name: str, shortName: str, positioning: str, audience: str,
  platforms: strings, formats: strings, timing: str, coreMessage: str, rationale: str,
  constraints: strings, uncertainties: strings, channels: z.array(channel).min(1).max(30), evidenceThemeIds: strings, updatedAt: str,
});
const evidence = z.object({ id, priority, status, relevance: z.number().int().min(1).max(5), content: str.optional() });
export const themeSchema = z.object({ id, rank: amount, title: str, summary: str, mentionCount: amount, direction: str, confidence: priority, claimType: z.enum(['观测事实', '分析推断']), evidenceSignalIds: strings, opportunity: str, caveat: str });
export const dataSchema = z.object({
  analyses: z.array(z.object({ id, provider: str, model: str, promptVersion: str, evidenceSignalIds: strings, evidenceDigest: str, createdAt: str, result: z.object({ themes: z.array(themeSchema), plans: z.array(planSchema) }) })).optional(),
  schemaVersion: z.literal(4), mode: z.enum(['demo', 'real']).optional(),
  company: z.object({ id, name: str.min(1), brand: str, industry: str, region: str, stage: str, product: str, productSpec: str, goal: str, budgetCents: amount.positive(), campaignStart: str, campaignEnd: str, updatedAt: str }),
  sources: z.array(z.object({ id, name: str, platform: str, kind: category, publishedAt: str, url: str.optional(), note: str, simulated: z.boolean(), collectedAt: str.optional(), taskId: str.optional(), contentHash: str.optional(), rawContent: str.optional(), origin: z.enum(['manual', 'public-web', 'rss', 'official', 'demo']).optional() })).max(100_000),
  signals: z.array(z.object({ id, title: str, summary: str, quote: str, sourceId: id, platform: str, category, priority, status, relevance: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]), impact: str, tags: strings, capturedAt: str, note: str, duplicateOf: str.optional(), conflictGroup: str.optional(), verifiedAt: str.optional() })).max(100_000),
  themes: z.array(themeSchema),
  opportunities: z.array(z.object({ id, title: str, fact: str, opportunity: str, verify: str, evidenceSignalIds: strings, tone: z.enum(['positive', 'neutral', 'caution']) })),
  plans: z.array(planSchema).max(20),
  approvals: z.array(z.object({ id, planId: id, planCode: z.enum(['A', 'B']), approvedAt: str, reason: str.min(1), plan: planSchema, companyBudgetCents: amount.positive(), fingerprint: str, evidenceSignalIds: strings, evidence: z.array(evidence), note: str })),
  reviews: z.array(z.object({ id, approvalId: id, planId: id.optional(), dataKind: z.enum(['simulated', 'manual']), note: str, observations: str, possibleReasons: str, unconfirmed: str, updatedAt: str, channels: z.array(z.object({ channel: id, actualSpendCents: amount.nullable(), impressions: amount.nullable(), clicks: amount.nullable(), leads: amount.nullable() })), suggestions: z.array(z.object({ id, title: str, detail: str, linkedSignalIds: strings })) })),
  feedbackTasks: z.array(z.object({ id, title: str, detail: str, trigger: str, createdAt: str, status: z.enum(['open', 'done']), linkedSignalIds: strings, source: z.enum(['review', 'manual']) })),
  decision: z.object({ status: z.enum(['approved', 'pending', 'hold']), planId: id.nullable(), holdReason: str.optional(), updatedAt: str }), activePlanId: str,
}) satisfies z.ZodType<AppData>;

export function parseData(value: unknown): AppData {
  const data = dataSchema.parse(value);
  data.mode ??= 'demo';
  for (const list of [data.sources, data.signals, data.themes, data.plans, data.approvals, data.reviews, data.feedbackTasks]) {
    if (new Set(list.map((x) => x.id)).size !== list.length) throw new Error('记录编号重复');
  }
  const sourceIds = new Set(data.sources.map((s) => s.id));
  const signalIds = new Set(data.signals.map((s) => s.id));
  const themeIds = new Set(data.themes.map((s) => s.id));
  const approvalIds = new Set(data.approvals.map((s) => s.id));
  if (data.signals.some((s) => !sourceIds.has(s.sourceId))) throw new Error('情报缺少来源');
  if (data.themes.some((t) => t.evidenceSignalIds.some((s) => !signalIds.has(s)))) throw new Error('主题引用不存在');
  if (data.plans.some((p) => p.evidenceThemeIds.some((t) => !themeIds.has(t)))) throw new Error('方案引用不存在');
  if (data.reviews.some((r) => !approvalIds.has(r.approvalId))) throw new Error('复盘缺少审批快照');
  if (data.plans.some((p) => new Set(p.channels.map((c) => c.channel)).size !== p.channels.length)) throw new Error('方案渠道不能重复');
  for (const approval of data.approvals) {
    if (approval.planId !== approval.plan.id || approval.planCode !== approval.plan.code || !checkPlanBudget(approval.plan, approval.companyBudgetCents).ok || approval.fingerprint !== buildPlanFingerprint(approval.plan, approval.companyBudgetCents, approval.evidence)) throw new Error('审批快照完整性校验失败');
  }
  for (const review of data.reviews) { const approval = data.approvals.find((a) => a.id === review.approvalId)!; if (new Set(review.channels.map((c) => c.channel)).size !== review.channels.length || review.channels.some((c) => !approval.plan.channels.some((p) => p.channel === c.channel))) throw new Error('复盘渠道与审批快照不一致'); }
  return data;
}
export const projectSchema = z.object({ id, name: str.min(1).max(200), mode: z.enum(['demo', 'real']), revision: id, updatedAt: str, data: dataSchema });
export const changeSchema = z.object({ id: z.string().uuid(), projectId: id, parentRevision: z.string().max(200), revision: id, project: projectSchema, createdAt: str, resolves: z.array(id).max(1000).default([]) });
export type Change = z.infer<typeof changeSchema>;
