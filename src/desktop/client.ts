import { create } from 'zustand';
import type { AppData } from '@/types/domain';
import type { Project, ProjectSummary } from '@/types/desktop';
import { useAppStore } from '@/store/appStore';
import { toast } from '@/store/toast';

export const useDesktopState = create<{ current: Project | null; projects: ProjectSummary[]; saving: boolean; error: string }>(() => ({ current: null, projects: [], saving: false, error: '' }));
let applying = false;
const pending = new Map<string, { project: Project; data: AppData }>();
let activeSave: Promise<void> | undefined;
const editVersions = new Map<string, number>();
let viewVersion = 0;
let selectionVersion = 0;
let switchVersion = 0;
export function applyProject(project: Project) {
  applying = true;
  if (useDesktopState.getState().current?.id !== project.id) selectionVersion++;
  viewVersion++;
  useDesktopState.setState({ current: project, error: '' });
  localStorage.setItem('guance:last-project', project.id);
  useAppStore.setState({ analyses: [], mode: 'demo', ...project.data });
  applying = false;
}
export async function refreshProjects() {
  if (window.guance) useDesktopState.setState({ projects: await window.guance.invoke('projects.list', undefined) });
}
type RefreshRead = { state: 'ready'; project: Project } | { state: 'edited' } | { state: 'superseded' };
async function readProjectForRefresh(id: string): Promise<RefreshRead> {
  const edits = editVersions.get(id) ?? 0; const view = viewVersion;
  const project = await window.guance!.invoke('projects.load', { id });
  if (project.id !== id) throw new Error('项目响应编号不匹配，未更新窗口');
  if ((editVersions.get(id) ?? 0) !== edits || pending.has(id)) return { state: 'edited' };
  if (useDesktopState.getState().current?.id !== id || viewVersion !== view) return { state: 'superseded' };
  return { state: 'ready', project };
}
export async function refreshProject(id: string): Promise<boolean> {
  while (window.guance && useDesktopState.getState().current?.id === id) {
    await flushDesktop();
    if (useDesktopState.getState().current?.id !== id) return false;
    const read = await readProjectForRefresh(id);
    if (read.state === 'edited') continue;
    if (read.state === 'superseded') return false;
    if (read.project.revision === useDesktopState.getState().current?.revision) return false;
    applyProject(read.project); return true;
  }
  return false;
}
export async function flushDesktop() {
  if (!window.guance) return;
  if (activeSave) { await activeSave; if (pending.size) return flushDesktop(); return; }
  activeSave = (async () => {
    while (pending.size) {
      const [projectId, queued] = pending.entries().next().value!; pending.delete(projectId);
      const { project: current, data } = queued; if (!window.guance) break;
      useDesktopState.setState({ saving: true });
      try {
        const saved = await window.guance.invoke('projects.save', { id: current.id, revision: current.revision, data });
        const waiting = pending.get(projectId); if (waiting) waiting.project = saved;
        if (useDesktopState.getState().current?.id === projectId) useDesktopState.setState({ current: saved, error: '' });
      } catch (error) {
        let message = error instanceof Error ? error.message : '保存失败';
        if (message.includes('CONFLICT')) {
          try {
            // An in-flight save contains an older draft. Persist every newer queued
            // draft against the same base before replacing the visible state.
            for (;;) {
              while (pending.has(projectId)) {
                const queued = pending.get(projectId)!;
                try { await window.guance.invoke('projects.save', { id: current.id, revision: current.revision, data: queued.data }); }
                catch (retained) { if (!(retained instanceof Error) || !retained.message.includes('CONFLICT')) throw retained; }
                if (pending.get(projectId) === queued) pending.delete(projectId);
              }
              // Reuse the refresh read guard without awaiting this active save.
              const read = await readProjectForRefresh(projectId);
              if (read.state === 'edited') continue;
              if (read.state === 'ready') applyProject(read.project);
              break;
            }
          } catch (retained) {
            if (!pending.has(projectId)) pending.set(projectId, queued);
            message = `${message}；最新编辑仍保留在窗口，保存后再切换。${retained instanceof Error ? retained.message : '无法保存编辑'}`;
          }
        } else {
          if (!pending.has(projectId)) pending.set(projectId, queued);
        }
        useDesktopState.setState({ error: message }); toast(message.includes('CONFLICT') ? '检测到版本冲突，请到设置核对' : '保存失败，编辑保留在窗口，请重试', message, 'danger'); throw error;
      } finally { useDesktopState.setState({ saving: false }); }
    }
  })();
  try { await activeSave; } finally { activeSave = undefined; }
}
export async function switchProject(id: string) {
  if (useDesktopState.getState().current?.id === id) { await refreshProject(id); return; }
  const request = ++switchVersion;
  await flushDesktop(); if (!window.guance) return;
  if (request !== switchVersion) return;
  const selection = selectionVersion;
  const project = await window.guance.invoke('projects.load', { id });
  if (project.id !== id) throw new Error('项目响应编号不匹配，未切换项目');
  await flushDesktop();
  if (request !== switchVersion || selection !== selectionVersion) return;
  applyProject(project);
  localStorage.setItem('guance:last-project', id);
}
export async function resetDesktopProject(id: string) {
  await flushDesktop();
  if (!window.guance || useDesktopState.getState().current?.id !== id) return;
  const selection = selectionVersion;
  await window.guance.invoke('projects.resetDemo', { id });
  if (useDesktopState.getState().current?.id === id && selectionVersion === selection) await refreshProject(id);
}
export async function initializeDesktop() {
  if (!window.guance) return;
  window.guance.onBeforeClose(flushDesktop);
  await refreshProjects();
  const projects = useDesktopState.getState().projects;
  const previous = localStorage.getItem('guance:last-project');
  await switchProject(projects.find((p) => p.id === previous)?.id ?? projects[0].id);
  window.addEventListener('guance:save', (event) => {
    if (applying) return;
    const current = useDesktopState.getState().current; if (!current) return;
    editVersions.set(current.id, (editVersions.get(current.id) ?? 0) + 1);
    pending.set(current.id, { project: current, data: structuredClone((event as CustomEvent<AppData>).detail) });
    void flushDesktop().catch(() => undefined);
  });
  window.addEventListener('guance:reset', () => {
    const id = useDesktopState.getState().current?.id;
    if (id) void resetDesktopProject(id).catch((e: unknown) => toast('未恢复数据', e instanceof Error ? e.message : '操作失败', 'warning'));
  });
  let polling = false;
  window.setInterval(() => { if (polling || pending.size || activeSave) return; polling = true; void (async () => { const id = useDesktopState.getState().current?.id; if (id && await refreshProject(id)) await refreshProjects(); })().catch((e: unknown) => useDesktopState.setState({ error: String(e) })).finally(() => { polling = false; }); }, 2000);
}
