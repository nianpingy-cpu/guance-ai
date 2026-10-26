import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useAppStore } from '@/store/appStore';
import { computeChannelMetrics, computeReviewMetrics, getApprovalHealth } from './calculations';

beforeEach(() => useAppStore.getState().resetDemo());
afterEach(() => vi.restoreAllMocks());

it('computes zero acquisition costs when recorded spend is zero and denominator is positive', () => {
  const actual = { channel: '测试', actualSpendCents: 0, impressions: 100, clicks: 10, leads: 2 };
  expect(computeReviewMetrics(10000, [actual]).cpcCents).toBe(0);
  expect(computeReviewMetrics(10000, [actual]).costPerLeadCents).toBe(0);
  expect(computeChannelMetrics('测试', 10000, actual).cpcCents).toBe(0);
  expect(computeChannelMetrics('测试', 10000, actual).costPerLeadCents).toBe(0);
});

it('keeps every approval and its review distinct even within the same millisecond', () => {
  vi.spyOn(Date, 'now').mockReturnValue(1793000000000);
  const first = useAppStore.getState().confirmPlan('PLAN-A', '首次确认');
  const second = useAppStore.getState().confirmPlan('PLAN-A', '再次确认');
  expect(first.ok && second.ok && first.approvalId !== second.approvalId).toBe(true);
});

it('rejects nonexistent review channels without silently reporting success', () => {
  const approval = useAppStore.getState().approvals[0];
  const result = useAppStore.getState().updateReviewChannel(approval.id, '不存在', { clicks: 10 });
  expect(result.ok).toBe(false);
});

it('preserves approval snapshot and requires review after approved campaign budget changes', () => {
  const old = structuredClone(useAppStore.getState().approvals);
  const result = useAppStore.getState().updateCompany({ budgetCents: 100000 });
  expect(result.ok).toBe(true);
  expect(getApprovalHealth(useAppStore.getState()).state).toBe('needs-reconfirm');
  expect(useAppStore.getState().confirmPlan('PLAN-A', '不允许超预算').ok).toBe(false);
  expect(useAppStore.getState().approvals).toEqual(old);
});
