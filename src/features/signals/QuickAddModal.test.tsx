import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { QuickAddModal } from './QuickAddModal';
import { createDemoData } from '@/data/demo';
import { useDesktopState } from '@/desktop/client';
import { useUiStore } from '@/store/ui';
import type { GuanceBridge, Project } from '@/types/desktop';

vi.mock('@/desktop/client', async (original) => ({
  ...await original<typeof import('@/desktop/client')>(),
  flushDesktop: vi.fn(async () => undefined),
  refreshProject: vi.fn(async () => false),
}));

let root: Root; let node: HTMLDivElement;
const project: Project = { id: 'P1', name: '粘贴测试', mode: 'real', revision: 'r1', updatedAt: '', data: createDemoData() };
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  useDesktopState.setState({ current: project, projects: [], saving: false, error: '' });
  useUiStore.setState({ quickAddOpen: true });
  node = document.createElement('div'); document.body.append(node); root = createRoot(node);
});
afterEach(async () => {
  await act(async () => root.unmount());
  node.remove(); useUiStore.setState({ quickAddOpen: false }); delete window.guance; vi.unstubAllGlobals();
});
function bridge(handler: (command: string, input: Record<string, unknown>) => unknown) {
  const invoke = vi.fn(async (command: string, input: unknown) => handler(command, input as Record<string, unknown>));
  window.guance = { desktop: true, onBeforeClose() {}, invoke: invoke as GuanceBridge['invoke'] }; return invoke;
}
function setValue(element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, value: string) {
  const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : element instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(element, value);
  element.dispatchEvent(new Event(element instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }));
}
function button(pattern: string | RegExp) { return [...document.body.querySelectorAll('button')].find(b => typeof pattern === 'string' ? b.textContent === pattern : pattern.test(b.textContent ?? ''))!; }

it('抖音/小红书文案只需粘贴即可保存，明确说明不用登录和密钥', async () => {
  const invoke = bridge((command) => {
    if (command === 'collect.start') return { id: 'J1', projectId: 'P1', kind: 'collect', status: 'running', progress: '正在保存', createdAt: '' };
    if (command === 'jobs.list') return [{ id: 'J1', projectId: 'P1', kind: 'collect', status: 'completed', progress: '已完成', result: '读取1条，新增1条', createdAt: '' }];
    return undefined;
  });
  await act(async () => { root.render(<QuickAddModal />); });
  expect(document.body.textContent).toContain('不用登录、不用填写应用ID或密钥');
  await act(async () => button('抖音 / 小红书文案').click());
  await act(async () => setValue(document.querySelector('#quick-social-platform') as HTMLSelectElement, 'xiaohongshu'));
  await act(async () => setValue(document.querySelector('#quick-social-content') as HTMLTextAreaElement, '秋季新品反馈\n用户提到质地清爽。 https://xhslink.com/a/demo'));
  await act(async () => button('保存为情报').click());
  await act(async () => { await new Promise((resolve) => window.setTimeout(resolve, 700)); });
  const call = invoke.mock.calls.find(([command]) => command === 'collect.start');
  expect(call?.[1]).toMatchObject({ kind: 'paste', platform: 'xiaohongshu', url: 'https://xhslink.com/a/demo' });
  expect(String((call?.[1] as { content?: string }).content)).toContain('秋季新品反馈');
  expect(document.body.textContent).toContain('读取1条，新增1条');
});

it('公众号链接会拒绝非文章地址，不会提交任务', async () => {
  const invoke = bridge(() => undefined);
  await act(async () => { root.render(<QuickAddModal />); });
  await act(async () => setValue(document.querySelector('#quick-wechat-links') as HTMLTextAreaElement, 'https://example.com/not-wechat'));
  await act(async () => button('读取并添加文章').click());
  expect(document.body.textContent).toContain('这不是公众号文章链接');
  expect(invoke.mock.calls.some(([command]) => command === 'collect.start')).toBe(false);
});
