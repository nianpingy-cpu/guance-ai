import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AnalysisPanel } from './AnalysisPanel';
import { CollectionPanel } from './CollectionPanel';
import { flushDesktop, useDesktopState } from './client';
import { useAppStore } from '@/store/appStore';
import { createDemoData } from '@/data/demo';
import type { GuanceBridge, Job, Project } from '@/types/desktop';

vi.mock('./client', async (original) => ({ ...await original<typeof import('./client')>(), flushDesktop: vi.fn(async () => undefined), refreshProject: vi.fn(async () => false) }));
const panels = [
  { name: 'analysis', Panel: AnalysisPanel, command: 'models.analyze', start: /使用.*条情报生成/, cancel: '取消任务' },
  { name: 'collect', Panel: CollectionPanel, command: 'collect.start', start: /开始采集/, cancel: '取消' },
] as const;
function deferred<T>() { let resolve!: (value: T) => void; let reject!: (reason: Error) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
function project(id: string): Project { return { id, name: id, mode: 'demo', revision: id, updatedAt: '', data: createDemoData() }; }
function job(kind: Job['kind'], status: Job['status'] = 'running'): Job { return { id: 'A-task', projectId: 'A', kind, status, progress: 'A_ONLY_PROGRESS', createdAt: '', ...(status === 'failed' ? { error: 'A_ONLY_ERROR' } : {}) }; }
let root: Root; let node: HTMLDivElement;
beforeEach(() => {
  vi.useFakeTimers(); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); vi.mocked(flushDesktop).mockReset().mockResolvedValue(undefined);
  useAppStore.setState(createDemoData()); useDesktopState.setState({ current: project('A') });
  node = document.createElement('div'); document.body.append(node); root = createRoot(node);
});
afterEach(async () => { await act(async () => root.unmount()); node.remove(); localStorage.clear(); delete window.guance; vi.useRealTimers(); vi.unstubAllGlobals(); });
function bridge(handler: (command: string, input: Record<string, unknown>) => unknown) {
  const invoke = vi.fn(async (command: string, input: unknown) => handler(command, input as Record<string, unknown>));
  window.guance = { desktop: true, onBeforeClose() {}, invoke: invoke as GuanceBridge['invoke'] }; return invoke;
}
async function switchTo(id: string) { await act(async () => useDesktopState.setState({ current: project(id) })); }
function button(pattern: string | RegExp) { return [...node.querySelectorAll('button')].find(b => typeof pattern === 'string' ? b.textContent === pattern : pattern.test(b.textContent ?? ''))!; }
async function start(panel: (typeof panels)[number]) {
  await act(async () => {
    if (panel.name === 'analysis') (node.querySelector('input[type="checkbox"]') as HTMLInputElement).click();
    else {
      const input = node.querySelector('#collect-url') as HTMLInputElement;
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'https://example.test/feed');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
  });
  expect(button(panel.start).disabled).toBe(false); await act(async () => button(panel.start).click());
}

it.each(panels)('$name clears previous-project task rows before the next poll returns', async (panel) => {
  const next = deferred<Job[]>(); bridge((command, input) => command === 'jobs.list' ? input.projectId === 'A' ? [job(panel.name)] : next.promise : undefined);
  await act(async () => root.render(<panel.Panel />)); expect(node.textContent).toContain('A_ONLY_PROGRESS');
  await switchTo('B'); expect(node.textContent).not.toContain('A_ONLY_PROGRESS'); expect(button(panel.cancel)).toBeUndefined();
  await act(async () => next.resolve([]));
});
it.each(panels)('$name clears previous-project errors while the next poll is pending', async (panel) => {
  const next = deferred<Job[]>(); bridge((command, input) => { if (command === 'jobs.list') { if (input.projectId === 'A') throw new Error('A_ONLY_ERROR'); return next.promise; } });
  await act(async () => root.render(<panel.Panel />)); expect(node.textContent).toContain('A_ONLY_ERROR');
  await switchTo('B'); expect(node.textContent).not.toContain('A_ONLY_ERROR'); await act(async () => next.resolve([]));
});
for (const outcome of ['success', 'failure'] as const) it.each(panels)(`$name ignores a previous-project ${outcome} from start`, async (panel) => {
  const response = deferred<Job>(); bridge(command => command === panel.command ? response.promise : []);
  await act(async () => root.render(<panel.Panel />)); await start(panel); await switchTo('B');
  await act(async () => { if (outcome === 'success') response.resolve(job(panel.name)); else response.reject(new Error('A_START_ERROR')); });
  expect(node.textContent).not.toContain('A_ONLY_PROGRESS'); expect(node.textContent).not.toContain('A_START_ERROR'); expect(node.textContent).not.toContain('采集任务已建立');
});
it.each(panels)('$name does not submit the old project after a pending flush finishes', async (panel) => {
  const saving = deferred<void>(); vi.mocked(flushDesktop).mockReturnValueOnce(saving.promise);
  const invoke = bridge(command => command === panel.command ? job(panel.name) : []); await act(async () => root.render(<panel.Panel />)); await start(panel); await switchTo('B');
  await act(async () => saving.resolve()); expect(invoke.mock.calls.some(([command]) => command === panel.command)).toBe(false);
});
it.each(panels)('$name ignores cancel errors after switching projects', async (panel) => {
  const response = deferred<void>(); bridge((command, input) => command === 'jobs.list' ? input.projectId === 'A' ? [job(panel.name)] : [] : response.promise);
  await act(async () => root.render(<panel.Panel />)); await act(async () => button(panel.cancel).click()); await switchTo('B');
  await act(async () => response.reject(new Error('A_CANCEL_ERROR'))); expect(node.textContent).not.toContain('A_CANCEL_ERROR');
});
for (const outcome of ['success', 'failure'] as const) it(`collect ignores a previous-project ${outcome} from retry`, async () => {
  const response = deferred<Job>(); bridge((command, input) => command === 'jobs.list' ? input.projectId === 'A' ? [job('collect', 'failed')] : [] : response.promise);
  await act(async () => root.render(<CollectionPanel />)); await act(async () => button(/手动重试/).click()); await switchTo('B');
  await act(async () => { if (outcome === 'success') response.resolve(job('collect')); else response.reject(new Error('A_RETRY_ERROR')); });
  expect(node.textContent).not.toContain('A_ONLY_PROGRESS'); expect(node.textContent).not.toContain('A_RETRY_ERROR');
});
it.each(panels)('$name ignores a start response from an earlier visit to the same project', async (panel) => {
  const response = deferred<Job>(); bridge(command => command === panel.command ? response.promise : []);
  await act(async () => root.render(<panel.Panel />)); await start(panel); await switchTo('B'); await switchTo('A');
  await act(async () => response.resolve(job(panel.name))); expect(node.textContent).not.toContain('A_ONLY_PROGRESS');
});

it.each(panels)('$name still shows and cancels a task started in the current project', async (panel) => {
  const invoke = bridge(command => command === panel.command ? job(panel.name) : []);
  await act(async () => root.render(<panel.Panel />)); await start(panel);
  expect(node.textContent).toContain('A_ONLY_PROGRESS'); await act(async () => button(panel.cancel).click());
  expect(invoke.mock.calls.some(([command, input]) => command === 'jobs.cancel' && (input as { id: string }).id === 'A-task')).toBe(true);
});
it('collect still displays a retried task for the current project', async () => {
  bridge(command => command === 'jobs.list' ? [job('collect', 'failed')] : { ...job('collect'), id: 'A-retried' });
  await act(async () => root.render(<CollectionPanel />)); await act(async () => button(/手动重试/).click());
  expect(node.textContent).toContain('A_ONLY_PROGRESS'); expect(button('取消')).toBeDefined();
});
