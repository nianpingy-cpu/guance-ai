import type { AppData } from '@/types/domain';
import { createDemoData, DEMO_SCHEMA_VERSION } from '@/data/demo';

export const STORAGE_KEY = 'guancha-ai-mvp-v04';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isAppData(value: unknown): value is AppData {
  if (!isRecord(value)) return false;
  if (value.schemaVersion !== DEMO_SCHEMA_VERSION) return false;
  if (!isRecord(value.company)) return false;
  if (!Array.isArray(value.signals) || !Array.isArray(value.plans)) return false;
  if (!Array.isArray(value.sources) || !Array.isArray(value.themes)) return false;
  if (!Array.isArray(value.approvals) || !Array.isArray(value.reviews)) return false;
  if (!Array.isArray(value.feedbackTasks) || !Array.isArray(value.opportunities)) return false;
  if (typeof value.activePlanId !== 'string') return false;
  return true;
}

/**
 * Local data access layer.
 * Everything the UI needs comes through this adapter, so a future backend
 * implementation can replace it without touching page components.
 */
export const localRepository = {
  load(): AppData | null {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed: unknown = JSON.parse(raw);
      const candidate =
        parsed && typeof parsed === 'object' && 'state' in parsed
          ? (parsed as { state: unknown }).state
          : parsed;
      if (!isAppData(candidate)) {
        localStorage.removeItem(STORAGE_KEY);
        return null;
      }
      return candidate;
    } catch {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
  },

  save(data: AppData): void {
    if (window.guance) { window.dispatchEvent(new CustomEvent('guance:save', { detail: data })); return; }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  },

  clear(): void {
    localStorage.removeItem(STORAGE_KEY);
  },

  reset(): AppData {
    const fresh = createDemoData();
    this.save(fresh);
    return fresh;
  },
};

export function initialAppData(): AppData {
  return localRepository.load() ?? createDemoData();
}

export function exportSnapshot(data: AppData): string {
  return JSON.stringify(
    {
      product: '观策AI v0.6',
      exportedAt: new Date().toISOString(),
      disclaimer: data.mode === 'real' ? '用户业务数据；每条来源及模型生成结果分别标记，非自动投放记录。' : '演示数据为虚构或模拟，不代表真实企业、平台或广告效果。',
      data,
    },
    null,
    2,
  );
}
