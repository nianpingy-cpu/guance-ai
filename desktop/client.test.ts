// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { LocalDatabase } from './database';
import type { GuanceBridge } from '@/types/desktop';
import type { AppData } from '@/types/domain';

const databases: LocalDatabase[] = [];
afterEach(() => { vi.unstubAllGlobals(); for (const db of databases.splice(0)) { db.close(); rmSync(db.directory, { recursive: true, force: true }); } });
async function setup(conflict: boolean) {
  vi.resetModules();
  const db = new LocalDatabase(mkdtempSync(join(tmpdir(), 'guance-queue-'))); databases.push(db);
  const project = db.create('队列', 'real');
  if (conflict) { const remote = structuredClone(project.data); remote.company.budgetCents = 888800; db.save(project.id, project.revision, remote); }
  let release: () => void = () => undefined; let first = true; let fail = !conflict;
  let loadHook: (() => void) | undefined;
  let loadBarrier: { wait: Promise<void>; started: () => void } | undefined;
  const fakeWindow = Object.assign(new EventTarget(), { setInterval: () => 0, setTimeout: () => 0, guance: {
    desktop: true, onBeforeClose: () => undefined,
    invoke: (async (command: string, input: unknown) => {
      const p = input as { id: string; revision: string; data: AppData };
      if (command === 'projects.list') return db.list();
      if (command === 'projects.load') {
        const hook = loadHook; loadHook = undefined; hook?.(); const loaded = db.load(p.id);
        const barrier = loadBarrier; loadBarrier = undefined;
        if (barrier) { barrier.started(); await barrier.wait; }
        return loaded;
      }
      if (command === 'projects.save') {
        if (first) { first = false; await new Promise<void>(resolve => { release = resolve; }); }
        if (fail) throw new Error('磁盘写入失败');
        return db.save(p.id, p.revision, p.data);
      }
      throw new Error(command);
    }) as GuanceBridge['invoke'],
  } satisfies GuanceBridge });
  const values = new Map<string, string>();
  vi.stubGlobal('window', fakeWindow); vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) });
  const client = await import('../src/desktop/client'); const { useAppStore } = await import('@/store/appStore');
  await client.initializeDesktop(); client.applyProject(project);
  return { db, project, client, useAppStore, release: () => release(), recover: () => { fail = false; }, duringNextLoad: (hook: () => void) => { loadHook = hook; }, delayNextLoad: () => {
    let releaseLoad: () => void = () => undefined; let started: () => void = () => undefined;
    const wait = new Promise<void>(resolve => { releaseLoad = resolve; }); const loaded = new Promise<void>(resolve => { started = resolve; });
    loadBarrier = { wait, started }; return { loaded, release: releaseLoad };
  } };
}
it('retains the latest queued edit as a durable conflict before restoring the remote project', async () => {
  const s = await setup(true);
  s.useAppStore.getState().updateCompany({ goal: '已发出的编辑' });
  s.useAppStore.getState().updateCompany({ goal: '更晚的待保存编辑' });
  s.release(); await expect(s.client.flushDesktop()).rejects.toThrow('CONFLICT');
  expect(s.db.conflicts().some(c => c.project.data.company.goal === '更晚的待保存编辑')).toBe(true);
  expect(s.useAppStore.getState().company.budgetCents).toBe(888800);
  await s.client.flushDesktop();
});
it('keeps the latest visible draft after an ordinary save failure and retries it', async () => {
  const s = await setup(false);
  s.useAppStore.getState().updateCompany({ goal: '第一次编辑' });
  s.useAppStore.getState().updateCompany({ goal: '磁盘恢复后应保存的最新编辑' });
  s.release(); await expect(s.client.flushDesktop()).rejects.toThrow('磁盘');
  expect(s.useAppStore.getState().company.goal).toBe('磁盘恢复后应保存的最新编辑');
  expect(s.db.load(s.project.id).data.company.goal).toBe('填写本轮营销目标');
  s.recover(); await s.client.flushDesktop();
  expect(s.db.load(s.project.id).data.company.goal).toBe('磁盘恢复后应保存的最新编辑');
});
it('keeps queued edits and save responses bound to their original project during a switch', async () => {
  const s = await setup(false); s.recover();
  const second = s.db.create('第二项目', 'real');
  s.useAppStore.getState().updateCompany({ goal: '第一项目编辑' });
  s.client.applyProject(second);
  s.useAppStore.getState().updateCompany({ goal: '第二项目编辑' });
  s.release(); await s.client.flushDesktop();
  expect(s.db.load(s.project.id).data.company.goal).toBe('第一项目编辑');
  expect(s.db.load(second.id).data.company.goal).toBe('第二项目编辑');
  expect(s.client.useDesktopState.getState().current?.id).toBe(second.id);
  expect(s.useAppStore.getState().company.name).toBe('第二项目');
});
it('retains an edit entered while the post-conflict reload is still pending', async () => {
  const s = await setup(true);
  s.useAppStore.getState().updateCompany({ goal: '冲突中的编辑' });
  s.duringNextLoad(() => s.useAppStore.getState().updateCompany({ goal: '加载期间继续输入' }));
  s.release(); await expect(s.client.flushDesktop()).rejects.toThrow('CONFLICT');
  expect(s.db.conflicts().some(c => c.project.data.company.goal === '加载期间继续输入')).toBe(true);
  expect(s.useAppStore.getState().company.budgetCents).toBe(888800);
});

it('keeps input entered during a task-completion load visible and saved after another field changes', async () => {
  const s = await setup(false); s.recover(); const delayed = s.delayNextLoad();
  const refresh = s.client.refreshProject(s.project.id);
  await delayed.loaded;
  s.useAppStore.getState().updateCompany({ goal: '任务刷新期间的新输入' });
  delayed.release(); await Promise.resolve(); s.release(); await refresh; await s.client.flushDesktop();
  expect(s.useAppStore.getState().company.goal).toBe('任务刷新期间的新输入');
  expect(s.db.load(s.project.id).data.company.goal).toBe('任务刷新期间的新输入');
  s.useAppStore.getState().updateCompany({ productSpec: '随后只改另一字段' }); await s.client.flushDesktop();
  expect(s.db.load(s.project.id).data.company.goal).toBe('任务刷新期间的新输入');
});

it('does not let a task-completion response switch back to its old project', async () => {
  const s = await setup(false); s.recover(); const second = s.db.create('第二项目', 'real'); const delayed = s.delayNextLoad();
  const refresh = s.client.refreshProject(s.project.id);
  await delayed.loaded; s.client.applyProject(second); s.useAppStore.getState().updateCompany({ goal: '第二项目继续输入' });
  delayed.release(); await Promise.resolve(); s.release(); await refresh; await s.client.flushDesktop();
  expect(s.client.useDesktopState.getState().current?.id).toBe(second.id);
  expect(s.useAppStore.getState().company.goal).toBe('第二项目继续输入');
  expect(s.db.load(second.id).data.company.goal).toBe('第二项目继续输入');
});

it('refreshing the selected project through switchProject keeps input entered during its load', async () => {
  const s = await setup(false); s.recover(); const delayed = s.delayNextLoad();
  const refresh = s.client.switchProject(s.project.id); await delayed.loaded;
  s.useAppStore.getState().updateCompany({ goal: '同项目刷新期间的新输入' });
  delayed.release(); await Promise.resolve(); s.release(); await refresh; await s.client.flushDesktop();
  expect(s.useAppStore.getState().company.goal).toBe('同项目刷新期间的新输入');
  expect(s.db.load(s.project.id).data.company.goal).toBe('同项目刷新期间的新输入');
});

it('saves edits to the source project while a different project is loading', async () => {
  const s = await setup(false); s.recover(); const second = s.db.create('第二项目', 'real'); const delayed = s.delayNextLoad();
  const switching = s.client.switchProject(second.id); await delayed.loaded;
  s.useAppStore.getState().updateCompany({ goal: '切换加载期间原项目的新输入' });
  delayed.release(); await Promise.resolve(); s.release(); await switching; await s.client.flushDesktop();
  expect(s.db.load(s.project.id).data.company.goal).toBe('切换加载期间原项目的新输入');
  expect(s.client.useDesktopState.getState().current?.id).toBe(second.id);
  expect(s.useAppStore.getState().company.name).toBe('第二项目');
});

it('does not apply an old refresh after the user has left and returned to a newer project view', async () => {
  const s = await setup(false); s.recover(); const second = s.db.create('第二项目', 'real'); const delayed = s.delayNextLoad();
  const refresh = s.client.refreshProject(s.project.id); await delayed.loaded;
  s.client.applyProject(second);
  const newer = s.db.load(s.project.id); newer.data.company.goal = '返回时已加载的新版本';
  s.client.applyProject(s.db.save(newer.id, newer.revision, newer.data));
  delayed.release(); await refresh;
  expect(s.useAppStore.getState().company.goal).toBe('返回时已加载的新版本');
});

it('keeps an edit saved before an older refresh response arrives', async () => {
  const s = await setup(false); s.recover(); const delayed = s.delayNextLoad();
  const refresh = s.client.refreshProject(s.project.id); await delayed.loaded;
  s.useAppStore.getState().updateCompany({ goal: '旧加载返回前已保存的新输入' });
  s.release(); await s.client.flushDesktop();
  delayed.release(); await refresh;
  expect(s.useAppStore.getState().company.goal).toBe('旧加载返回前已保存的新输入');
  expect(s.db.load(s.project.id).data.company.goal).toBe('旧加载返回前已保存的新输入');
});

it('preserves a new draft when saving it fails during a refresh', async () => {
  const s = await setup(false); const delayed = s.delayNextLoad();
  const refresh = s.client.refreshProject(s.project.id); await delayed.loaded;
  s.useAppStore.getState().updateCompany({ goal: '刷新中磁盘失败仍保留的输入' });
  delayed.release(); await Promise.resolve(); s.release(); await expect(refresh).rejects.toThrow('磁盘');
  expect(s.useAppStore.getState().company.goal).toBe('刷新中磁盘失败仍保留的输入');
  s.recover(); await s.client.flushDesktop(); expect(s.db.load(s.project.id).data.company.goal).toBe('刷新中磁盘失败仍保留的输入');
});

it('a same-project background refresh does not cancel a pending choice of a different project', async () => {
  const s = await setup(false); s.recover(); const second = s.db.create('第二项目', 'real'); const delayed = s.delayNextLoad();
  const switching = s.client.switchProject(second.id); await delayed.loaded;
  await s.client.switchProject(s.project.id);
  delayed.release(); await switching;
  expect(s.client.useDesktopState.getState().current?.id).toBe(second.id);
});
