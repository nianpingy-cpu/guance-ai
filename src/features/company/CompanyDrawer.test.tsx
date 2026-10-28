import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { CompanyDrawer } from './CompanyDrawer';
import { useAppStore } from '@/store/appStore';
import { useUiStore } from '@/store/ui';

beforeEach(() => vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true));
afterEach(() => { useUiStore.getState().closeCompanyDrawer(); localStorage.clear(); vi.unstubAllGlobals(); });
it.each([1, 500049, 500050])('preserves %i cents when opening and saving company details', async (cents) => {
  useAppStore.getState().resetDemo(); useAppStore.getState().updateCompany({ budgetCents: cents });
  const node = document.createElement('div'); document.body.append(node); const root = createRoot(node);
  try {
    await act(async () => { root.render(<CompanyDrawer />); useUiStore.getState().openCompanyDrawer(); });
    expect((document.getElementById('company-budget') as HTMLInputElement).value).toBe((cents / 100).toFixed(2));
    const save = [...document.querySelectorAll('button')].find(button => button.textContent?.includes('保存资料'))!;
    await act(async () => save.click());
    expect(useAppStore.getState().company.budgetCents).toBe(cents);
  } finally { await act(async () => root.unmount()); node.remove(); }
});
