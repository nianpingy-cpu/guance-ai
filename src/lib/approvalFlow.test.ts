import { beforeEach, expect, it } from 'vitest';
import { useAppStore } from '@/store/appStore';
import { getApprovalHealth } from '@/lib/calculations';

beforeEach(() => useAppStore.getState().resetDemo());

it('confirms a plan after evidence changes and becomes valid again', () => {
  useAppStore.getState().updateSignal('S-02', { status: 'verified' });
  expect(getApprovalHealth(useAppStore.getState()).state).toBe('needs-reconfirm');
  const result = useAppStore.getState().confirmPlan('PLAN-A', '重新确认');
  expect(result.ok).toBe(true);
  expect(getApprovalHealth(useAppStore.getState()).state).toBe('valid');
});
