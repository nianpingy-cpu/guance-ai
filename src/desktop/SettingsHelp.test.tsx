import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ConnectionSettings } from './ConnectionSettings';
import { SyncSettings } from './SyncSettings';
import type { Connection, GuanceBridge } from '@/types/desktop';

let root: Root; let node: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: vi.fn(async () => undefined) } });
  docCommand();
  node = document.createElement('div'); document.body.append(node); root = createRoot(node);
});
afterEach(async () => { await act(async () => root.unmount()); node.remove(); delete window.guance; vi.unstubAllGlobals(); });
function docCommand() { Object.defineProperty(document, 'execCommand', { configurable: true, value: vi.fn(() => true) }); }
function bridge(handler: (command: string, input: Record<string, unknown>) => unknown) {
  const invoke = vi.fn(async (command: string, input: unknown) => handler(command, input as Record<string, unknown>));
  window.guance = { desktop: true, onBeforeClose() {}, invoke: invoke as GuanceBridge['invoke'] }; return invoke;
}
function setValue(input: HTMLInputElement, value: string) { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value); input.dispatchEvent(new Event('input', { bubbles: true })); }
function button(pattern: string | RegExp) { return [...node.querySelectorAll('button')].find(b => typeof pattern === 'string' ? b.textContent === pattern : pattern.test(b.textContent ?? ''))!; }
const saved: Connection[] = [
  { id: 'wechat', name: '微信公众号', status: '待开通', link: '', description: '', appId: '', hasSecret: false },
  { id: 'xiaohongshu', name: '小红书', status: '待开通', link: '', description: '', appId: 'xhs-app', hasSecret: true },
  { id: 'douyin', name: '抖音', status: '待开通', link: '', description: '', appId: 'douyin-app', hasSecret: false },
];

it('平台设置先说明不是账号密码，并给出官方登录入口', async () => {
  bridge((command) => command === 'connections.list' ? saved : undefined);
  await act(async () => { root.render(<ConnectionSettings />); });
  expect(node.textContent).toContain('应用ID / 密钥不是账号密码');
  expect(node.textContent).toContain('抖音');
  expect(node.textContent).toContain('video.search');
  expect(node.querySelector('a[href="https://open.douyin.com/"]')?.textContent).toContain('打开抖音开放平台登录');
  expect(node.textContent).toContain('为什么没有“一键登录 / 直接登录”');
  expect((node.querySelector('#platform-appid') as HTMLInputElement).value).toBe('douyin-app');
});

it('首次保存平台凭据要求 AppID 和密钥都填写', async () => {
  const invoke = bridge((command) => command === 'connections.list' ? saved : undefined);
  await act(async () => { root.render(<ConnectionSettings />); });
  const save = button('保存到本机'); expect(save.disabled).toBe(true);
  await act(async () => setValue(node.querySelector('#platform-appid') as HTMLInputElement, 'douyin-app'));
  expect(save.disabled).toBe(true);
  await act(async () => setValue(node.querySelector('#platform-secret') as HTMLInputElement, 'douyin-secret'));
  expect(save.disabled).toBe(false);
  await act(async () => save.click());
  expect(invoke.mock.calls.some(([command, input]) => command === 'connections.save' && (input as { platform: string }).platform === 'douyin' && (input as { appId: string }).appId === 'douyin-app')).toBe(true);
});

it('切换平台会带出已保存的 AppID，并显示该平台步骤', async () => {
  bridge((command) => command === 'connections.list' ? saved : undefined);
  await act(async () => { root.render(<ConnectionSettings />); });
  const select = node.querySelector('#platform-select') as HTMLSelectElement;
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!.call(select, 'xiaohongshu'); select.dispatchEvent(new Event('change', { bubbles: true })); });
  expect((node.querySelector('#platform-appid') as HTMLInputElement).value).toBe('xhs-app');
  expect(node.textContent).toContain('应用管理 → 应用详情');
  expect(node.querySelector('a[href="https://open.xiaohongshu.com/"]')?.textContent).toContain('打开小红书开放平台登录');
});

it('WebDAV 设置给出三步说明和坚果云示例，并可生成同步口令', async () => {
  bridge((command) => command === 'sync.status' ? { configured: false, url: '', username: '', automatic: false, busy: false, lastSuccess: '', error: '', conflicts: [] } : command === 'projects.list' ? [] : undefined);
  await act(async () => { root.render(<SyncSettings />); });
  expect(node.textContent).toContain('三步完成');
  expect(node.textContent).toContain('https://dav.jianguoyun.com/dav/');
  expect(node.textContent).toContain('不用手动建文件夹');
  expect(button('保存并测试连接').disabled).toBe(true);
  await act(async () => button('生成').click());
  const phrase = node.querySelector('#dav-phrase') as HTMLInputElement;
  expect(phrase.value.length).toBeGreaterThanOrEqual(12);
  expect(navigator.clipboard.writeText).toHaveBeenCalledWith(phrase.value);
  expect(node.textContent).toContain('第二台设备必须填写完全相同的口令');
});

it('首次 WebDAV 配置必须填写地址、用户名、密码和至少12位口令', async () => {
  const invoke = bridge((command) => command === 'sync.status' ? { configured: false, url: '', username: '', automatic: false, busy: false, lastSuccess: '', error: '', conflicts: [] } : command === 'projects.list' ? [] : command === 'sync.test' ? '连接成功' : undefined);
  await act(async () => { root.render(<SyncSettings />); });
  await act(async () => {
    setValue(node.querySelector('#dav-url') as HTMLInputElement, 'https://dav.jianguoyun.com/dav/');
    setValue(node.querySelector('#dav-user') as HTMLInputElement, 'me@example.test');
    setValue(node.querySelector('#dav-password') as HTMLInputElement, 'app-password');
  });
  expect(button('保存并测试连接').disabled).toBe(true);
  await act(async () => button('生成').click());
  expect(button('保存并测试连接').disabled).toBe(false);
  await act(async () => button('保存并测试连接').click());
  const call = invoke.mock.calls.find(([command]) => command === 'sync.configure');
  expect(call?.[1]).toMatchObject({ url: 'https://dav.jianguoyun.com/dav/', username: 'me@example.test', password: 'app-password' });
  expect(String((call?.[1] as { passphrase?: string }).passphrase).length).toBeGreaterThanOrEqual(12);
  expect(invoke.mock.calls.some(([command]) => command === 'sync.test')).toBe(true);
});
