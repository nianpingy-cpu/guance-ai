import { beforeEach, describe, expect, it } from 'vitest';
import { useAppStore } from '@/store/appStore';
import {
  checkPlanBudget,
  computeChannelMetrics,
  computeReviewMetrics,
  getApprovalHealth,
  getReviewForApproval,
  scaleChannelsToCap,
  totalPlanCents,
} from '@/lib/calculations';
import { parseWholeNumber, parseYuanToCents } from '@/lib/format';

const reset = () => useAppStore.getState().resetDemo();

describe('budget constraints', () => {
  beforeEach(reset);

  it('accepts a plan exactly at the cap and rejects over-allocation', () => {
    const state = useAppStore.getState();
    const plan = state.plans[0];
    expect(totalPlanCents(plan)).toBe(500000);
    expect(checkPlanBudget(plan, 500000).ok).toBe(true);
    const over = checkPlanBudget(plan, 420000);
    expect(over.ok).toBe(false);
    expect(over.overByCents).toBe(80000);
  });

  it('blocks channel edits that would push total above cap', () => {
    const result = useAppStore.getState().updatePlanChannelBudget('PLAN-A', '小红书', 300000);
    expect(result.ok).toBe(false);
    expect(totalPlanCents(useAppStore.getState().plans[0])).toBe(500000);
  });

  it('scales channel budgets down to the cap deterministically', () => {
    const scaled = scaleChannelsToCap(useAppStore.getState().plans[0], 420000);
    expect(totalPlanCents(scaled)).toBe(420000);
    expect(scaled.channels.every((channel) => channel.budgetCents % 100 === 0)).toBe(true);
  });

  it('parses yuan to integer cents and rejects malformed amounts', () => {
    expect(parseYuanToCents('1,999.99')).toEqual({ ok: true, cents: 199999 });
    expect(parseYuanToCents('19.999').ok).toBe(false);
    expect(parseYuanToCents('-1').ok).toBe(false);
    expect(parseWholeNumber('0')).toBe(0);
    expect(parseWholeNumber('-2')).toBeNull();
  });
});

describe('review metric calculation', () => {
  it('recomputes totals and derived metrics from channel data', () => {
    const metrics = computeReviewMetrics(500000, [
      { channel: 'A', actualSpendCents: 198000, impressions: 46000, clicks: 1150, leads: 31 },
      { channel: 'B', actualSpendCents: 176000, impressions: 61400, clicks: 1540, leads: 34 },
      { channel: 'C', actualSpendCents: 112000, impressions: 21000, clicks: 430, leads: 17 },
    ]);
    expect(metrics.actualSpendCents).toBe(486000);
    expect(metrics.impressions).toBe(128400);
    expect(metrics.clicks).toBe(3120);
    expect(metrics.leads).toBe(82);
    expect(metrics.ctr).toBeCloseTo(3120 / 128400, 8);
    expect(metrics.cpcCents).toBeCloseTo(486000 / 3120, 6);
    expect(metrics.costPerLeadCents).toBeCloseTo(486000 / 82, 6);
  });

  it('returns null aggregates when any channel is missing, never silently zero', () => {
    const metrics = computeReviewMetrics(500000, [
      { channel: 'A', actualSpendCents: 100000, impressions: 1000, clicks: 20, leads: 2 },
      { channel: 'B', actualSpendCents: null, impressions: null, clicks: null, leads: null },
    ]);
    expect(metrics.actualSpendCents).toBeNull();
    expect(metrics.impressions).toBeNull();
    expect(metrics.ctr).toBeNull();
  });

  it('does not compute CPC or cost per lead when denominators are zero', () => {
    const metrics = computeReviewMetrics(100000, [
      { channel: 'A', actualSpendCents: 100000, impressions: 0, clicks: 0, leads: 0 },
    ]);
    expect(metrics.ctr).toBeNull();
    expect(metrics.cpcCents).toBeNull();
    expect(metrics.costPerLeadCents).toBeNull();
    const channel = computeChannelMetrics('A', 100000, {
      channel: 'A',
      actualSpendCents: 100000,
      impressions: 0,
      clicks: 0,
      leads: 0,
    });
    expect(channel.ctr).toBeNull();
  });
});

describe('approval invalidation and snapshots', () => {
  beforeEach(reset);

  it('starts with a valid approval fingerprint', () => {
    const state = useAppStore.getState();
    const health = getApprovalHealth(state);
    expect(health.state).toBe('valid');
    if (health.state === 'valid') {
      expect(health.approval.planId).toBe('PLAN-A');
      expect(getReviewForApproval(state, health.approval.id)?.channels.length).toBe(3);
    }
  });

  it('requires reconfirmation after a linked signal priority changes', () => {
    useAppStore.getState().updateSignal('S-01', { priority: 'medium' });
    expect(getApprovalHealth(useAppStore.getState()).state).toBe('needs-reconfirm');
  });

  it('requires reconfirmation after the company budget changes', () => {
    useAppStore.getState().updateCompany({ budgetCents: 450000 });
    const health = getApprovalHealth(useAppStore.getState());
    expect(health.state).toBe('needs-reconfirm');
  });

  it('requires reconfirmation after the live plan is edited', () => {
    useAppStore.getState().updatePlanMeta('PLAN-A', { coreMessage: '新的核心信息' });
    expect(getApprovalHealth(useAppStore.getState()).state).toBe('needs-reconfirm');
  });

  it('saves a snapshot only when the reason and budget are valid', () => {
    const store = useAppStore.getState();
    expect(store.confirmPlan('PLAN-B', '').ok).toBe(false);
    const ok = store.confirmPlan('PLAN-B', '用小预算测试同城即时礼赠。');
    expect(ok.ok).toBe(true);
    const next = useAppStore.getState();
    expect(next.decision.planId).toBe('PLAN-B');
    const health = getApprovalHealth(next);
    expect(health.state).toBe('valid');
    if (health.state === 'valid') {
      expect(health.approval.planCode).toBe('B');
      expect(health.approval.fingerprint).toMatch(/^fp_/);
      expect(getReviewForApproval(next, health.approval.id)).toBeUndefined();
    }
  });

  it('creates review data only when actual fields are updated', () => {
    const store = useAppStore.getState();
    const health = getApprovalHealth(store);
    const approvalId = health.state === 'valid' ? health.approval.id : '';
    const result = store.updateReviewChannel(approvalId, '抖音', { impressions: 70000 });
    expect(result.ok).toBe(true);
    const review = getReviewForApproval(useAppStore.getState(), approvalId);
    expect(review?.channels.find((channel) => channel.channel === '抖音')?.impressions).toBe(70000);
    expect(store.updateReviewChannel(approvalId, '抖音', { clicks: -1 }).ok).toBe(false);
  });

  it('adds a feedback task once and keeps it open', () => {
    const store = useAppStore.getState();
    const payload = {
      title: '补充一项测试任务',
      detail: '测试详情',
      trigger: '单元测试',
      linkedSignalIds: ['S-01'],
    };
    expect(store.addFeedbackTask(payload).ok).toBe(true);
    expect(useAppStore.getState().addFeedbackTask(payload).ok).toBe(false);
    expect(useAppStore.getState().feedbackTasks.filter((task) => task.title === payload.title).length).toBe(1);
  });
});
