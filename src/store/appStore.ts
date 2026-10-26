import { create } from 'zustand';
import { persist, type PersistStorage, type StorageValue } from 'zustand/middleware';
import type {
  AppData,
  ApprovalSnapshot,
  Company,
  FeedbackTask,
  ImportResult,
  Plan,
  Review,
  ReviewChannelActual,
  Signal,
  Source,
} from '@/types/domain';
import { createDemoData, DEMO_NOW } from '@/data/demo';
import {
  isAppData,
  localRepository,
  STORAGE_KEY,
} from '@/data/repository';
import {
  buildPlanFingerprint,
  checkPlanBudget,
  getLatestApproval,
  planEvidenceIds,
  scaleChannelsToCap,
  snapshotEvidence,
  totalPlanCents,
} from '@/lib/calculations';

type ActionResult = { ok: true } | { ok: false; message: string };
type ConfirmResult =
  | { ok: true; approvalId: string }
  | { ok: false; message: string };

interface AppActions {
  updateCompany: (patch: Partial<Company>) => ActionResult;
  updateSignal: (signalId: string, patch: Partial<Signal>) => ActionResult;
  updateSignalNote: (signalId: string, note: string) => void;
  applyImport: (result: ImportResult & { signals: Signal[]; sources: Source[] }, filename: string) => void;
  addFeedbackTask: (task: Omit<FeedbackTask, 'id' | 'createdAt' | 'status' | 'source'>) => ActionResult;
  toggleFeedbackTask: (taskId: string) => void;
  selectPlan: (planId: string) => void;
  updatePlanMeta: (planId: string, patch: Partial<Plan>) => void;
  updatePlanChannelBudget: (
    planId: string,
    channel: string,
    budgetCents: number,
  ) => ActionResult;
  adjustPlanToCap: (planId: string) => void;
  confirmPlan: (planId: string, reason: string) => ConfirmResult;
  holdCampaign: (reason: string) => ActionResult;
  resumePlanSelection: () => void;
  updateReviewChannel: (
    approvalId: string,
    channel: string,
    patch: Partial<ReviewChannelActual>,
  ) => ActionResult;
  updateReviewFields: (
    approvalId: string,
    patch: Partial<Pick<Review, 'note' | 'observations' | 'possibleReasons' | 'unconfirmed'>>,
  ) => void;
  resetDemo: () => void;
}

export type AppStore = AppData & AppActions;

const storage: PersistStorage<AppData> = {
  getItem: (name) => {
    try {
      const raw = localStorage.getItem(name);
      if (!raw) return null;
      const parsed: unknown = JSON.parse(raw);
      const candidate =
        parsed && typeof parsed === 'object' && 'state' in parsed
          ? (parsed as StorageValue<AppData>).state
          : parsed;
      if (!isAppData(candidate)) return null;
      return { state: candidate, version: candidate.schemaVersion };
    } catch {
      return null;
    }
  },
  setItem: (_name, value) => {
    localRepository.save(value.state);
  },
  removeItem: (name) => {
    localStorage.removeItem(name);
  },
};

function now(): string {
  // The demo campaign happens after the wall-clock date used while building it.
  // Clamp the visible demo clock so newly approved snapshots sort after seed data.
  return new Date(Math.max(Date.now(), Date.parse(DEMO_NOW))).toISOString();
}

function createReviewFor(approval: ApprovalSnapshot): Review {
  return {
    id: `REV-${Date.now()}`,
    approvalId: approval.id,
    planId: approval.planId,
    dataKind: 'simulated',
    note: '本轮数据为演示输入；没有真实投放接口。',
    observations: '',
    possibleReasons: '',
    unconfirmed: '',
    updatedAt: now(),
    channels: approval.plan.channels.map((channel) => ({
      channel: channel.channel,
      actualSpendCents: null,
      impressions: null,
      clicks: null,
      leads: null,
    })),
    suggestions: [],
  };
}

function ensureReview(reviews: Review[], approval: ApprovalSnapshot): Review[] {
  if (reviews.some((review) => review.approvalId === approval.id)) return reviews;
  return [...reviews, createReviewFor(approval)];
}

const validNumber = (value: number | null): boolean =>
  value === null || (Number.isSafeInteger(value) && value >= 0);

export const useAppStore = create<AppStore>()(
  persist(
    (set, get) => ({
      ...createDemoData(),

      updateCompany: (patch) => {
        const company = { ...get().company, ...patch };
        if (!company.name.trim()) return { ok: false, message: '企业名称不能为空' };
        if (!Number.isSafeInteger(company.budgetCents) || company.budgetCents <= 0) {
          return { ok: false, message: '预算上限须为大于 0 的整数（单位：分）' };
        }
        set({ company: { ...company, updatedAt: now() } });
        return { ok: true };
      },

      updateSignal: (signalId, patch) => {
        const signal = get().signals.find((item) => item.id === signalId);
        if (!signal) return { ok: false, message: '未找到该情报' };
        const next: Signal = { ...signal, ...patch };
        if (next.relevance < 1 || next.relevance > 5) {
          return { ok: false, message: '相关性须为 1–5' };
        }
        if (patch.status === 'verified' && signal.status !== 'verified') {
          next.verifiedAt = now();
        }
        if (patch.status && patch.status !== 'verified') {
          delete next.verifiedAt;
        }
        set((state) => ({
          signals: state.signals.map((item) => (item.id === signalId ? next : item)),
        }));
        return { ok: true };
      },

      updateSignalNote: (signalId, note) => {
        set((state) => ({
          signals: state.signals.map((item) =>
            item.id === signalId ? { ...item, note: note.trim() } : item,
          ),
        }));
      },

      applyImport: (result, filename) => {
        if (result.successCount === 0) return;
        set((state) => ({
          signals: [...result.signals, ...state.signals],
          sources: [...result.sources, ...state.sources],
          feedbackTasks: [
            {
              id: `FT-${Date.now()}`,
              title: `核对导入文件：${filename}`,
              detail: `已导入 ${result.successCount} 条情报，请人工核实来源与重复记录。`,
              trigger: '情报导入',
              createdAt: now(),
              status: 'open',
              linkedSignalIds: result.importedIds.slice(0, 5),
              source: 'manual',
            },
            ...state.feedbackTasks,
          ],
        }));
      },

      addFeedbackTask: (task) => {
        if (!task.title.trim()) return { ok: false, message: '任务标题不能为空' };
        if (get().feedbackTasks.some((item) => item.title === task.title.trim())) {
          return { ok: false, message: '该下一轮任务已存在' };
        }
        set((state) => ({
          feedbackTasks: [
            {
              ...task,
              id: `FT-${Date.now()}`,
              title: task.title.trim(),
              status: 'open',
              createdAt: now(),
              source: 'review',
            },
            ...state.feedbackTasks,
          ],
        }));
        return { ok: true };
      },

      toggleFeedbackTask: (taskId) => {
        set((state) => ({
          feedbackTasks: state.feedbackTasks.map((task) =>
            task.id === taskId
              ? { ...task, status: task.status === 'open' ? 'done' : 'open' }
              : task,
          ),
        }));
      },

      selectPlan: (planId) => {
        if (!get().plans.some((plan) => plan.id === planId)) return;
        set({ activePlanId: planId });
      },

      updatePlanMeta: (planId, patch) => {
        set((state) => ({
          plans: state.plans.map((plan) =>
            plan.id === planId ? { ...plan, ...patch, id: plan.id, updatedAt: now() } : plan,
          ),
        }));
      },

      updatePlanChannelBudget: (planId, channel, budgetCents) => {
        if (!Number.isSafeInteger(budgetCents) || budgetCents < 0) {
          return { ok: false, message: '预算须为非负整数（单位：分）' };
        }
        const state = get();
        const plan = state.plans.find((item) => item.id === planId);
        if (!plan) return { ok: false, message: '未找到该方案' };
        const nextPlan: Plan = {
          ...plan,
          channels: plan.channels.map((item) =>
            item.channel === channel ? { ...item, budgetCents } : item,
          ),
          updatedAt: now(),
        };
        const check = checkPlanBudget(nextPlan, state.company.budgetCents);
        if (check.overByCents > 0) {
          return {
            ok: false,
            message: `合计预算不能超过企业上限，当前超出 ${(check.overByCents / 100).toFixed(2)} 元`,
          };
        }
        set((current) => ({
          plans: current.plans.map((item) => (item.id === planId ? nextPlan : item)),
        }));
        return { ok: true };
      },

      adjustPlanToCap: (planId) => {
        const state = get();
        const plan = state.plans.find((item) => item.id === planId);
        if (!plan) return;
        const scaled = scaleChannelsToCap(plan, state.company.budgetCents);
        set((current) => ({
          plans: current.plans.map((item) =>
            item.id === planId ? { ...scaled, updatedAt: now() } : item,
          ),
        }));
      },

      confirmPlan: (planId, reason) => {
        const state = get();
        const plan = state.plans.find((item) => item.id === planId);
        if (!plan) return { ok: false, message: '未找到该方案' };
        const check = checkPlanBudget(plan, state.company.budgetCents);
        if (!check.ok) return { ok: false, message: check.message };
        if (!reason.trim()) return { ok: false, message: '请填写确认理由，审批快照需要记录依据' };

        const evidenceIds = planEvidenceIds(plan, state);
        const evidence = snapshotEvidence(state.signals, evidenceIds);
        const approval: ApprovalSnapshot = {
          id: `APR-${Date.now()}`,
          planId: plan.id,
          planCode: plan.code,
          approvedAt: now(),
          reason: reason.trim(),
          plan: structuredClone(plan),
          companyBudgetCents: state.company.budgetCents,
          fingerprint: buildPlanFingerprint(plan, state.company.budgetCents, evidence),
          evidenceSignalIds: evidenceIds,
          evidence,
          note: '审批快照保存了方案、预算上限与关键证据状态。若其中任一项变化，需要重新确认。',
        };
        set({
          approvals: [...state.approvals, approval],
          decision: {
            status: 'approved',
            planId: plan.id,
            updatedAt: now(),
          },
          activePlanId: plan.id,
        });
        return { ok: true, approvalId: approval.id };
      },

      holdCampaign: (reason) => {
        if (!reason.trim()) return { ok: false, message: '请填写暂不投放的原因' };
        set({
          decision: {
            status: 'hold',
            planId: get().activePlanId,
            holdReason: reason.trim(),
            updatedAt: now(),
          },
        });
        return { ok: true };
      },

      resumePlanSelection: () => {
        set({
          decision: {
            status: 'pending',
            planId: null,
            updatedAt: now(),
          },
        });
      },

      updateReviewChannel: (approvalId, channel, patch) => {
        const state = get();
        const approval = state.approvals.find((item) => item.id === approvalId);
        if (!approval) return { ok: false, message: '审批快照不存在' };
        for (const [key, value] of Object.entries(patch)) {
          if (key === 'channel' || value === undefined) continue;
          if (!validNumber(value as number | null)) {
            return { ok: false, message: '实际数据须为非负整数（金额单位为分）' };
          }
        }
        const reviews = ensureReview(state.reviews, approval);
        set({
          reviews: reviews.map((review) => {
            if (review.approvalId !== approvalId) return review;
            return {
              ...review,
              updatedAt: now(),
              channels: review.channels.map((item) =>
                item.channel === channel ? { ...item, ...patch } : item,
              ),
            };
          }),
        });
        return { ok: true };
      },

      updateReviewFields: (approvalId, patch) => {
        const state = get();
        const approval = state.approvals.find((item) => item.id === approvalId);
        if (!approval) return;
        const reviews = ensureReview(state.reviews, approval);
        set({
          reviews: reviews.map((review) =>
            review.approvalId === approvalId
              ? { ...review, ...patch, updatedAt: now() }
              : review,
          ),
        });
      },

      resetDemo: () => {
        const fresh = createDemoData();
        localRepository.save(fresh);
        set(fresh);
      },
    }),
    {
      name: STORAGE_KEY,
      version: 4,
      storage,
      partialize: (state): AppData => ({
        schemaVersion: state.schemaVersion,
        company: state.company,
        sources: state.sources,
        signals: state.signals,
        themes: state.themes,
        opportunities: state.opportunities,
        plans: state.plans,
        approvals: state.approvals,
        reviews: state.reviews,
        feedbackTasks: state.feedbackTasks,
        decision: state.decision,
        activePlanId: state.activePlanId,
      }),
      merge: (persisted, current) => {
        if (!isAppData(persisted)) return current;
        return { ...current, ...persisted };
      },
    },
  ),
);

export function useActivePlan(): Plan | undefined {
  const activePlanId = useAppStore((state) => state.activePlanId);
  return useAppStore((state) => state.plans.find((plan) => plan.id === activePlanId));
}

export function useLatestPlanApproval(planId: string): ApprovalSnapshot | undefined {
  return useAppStore((state) => getLatestApproval(state.approvals, planId));
}

export { totalPlanCents };
