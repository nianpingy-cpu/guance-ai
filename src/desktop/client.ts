import { create } from 'zustand';
import type { AppData } from '@/types/domain';
import type { Project, ProjectSummary } from '@/types/desktop';
import { useAppStore } from '@/store/appStore';
import { toast } from '@/store/toast';

export const useDesktopState = create<{ current: Project | null; projects: ProjectSummary[]; saving: boolean; error: string }>(() => ({ current: null, projects: [], saving: false, error: '' }));
let applying = false;
let pending: AppData | undefined;
let activeSave: Promise<void> | undefined;
export function applyProject(project: Project) {
  applying = true;
  useDesktopState.setState({ current: project, error: '' });
  useAppStore.setState({ analyses: [], mode: 'demo', ...project.data });
  applying = false;
}
export async function refreshProjects() {
  if (window.guance) useDesktopState.setState({ projects: await window.guance.invoke('projects.list', undefined) });
}
export async function flushDesktop() {
  if (!window.guance) return;
  if (activeSave) { await activeSave; if (pending) return flushDesktop(); return; }
  activeSave = (async () => {
    while (pending) {
      const data = pending; pending = undefined;
      const current = useDesktopState.getState().current; if (!current || !window.guance) break;
      useDesktopState.setState({ saving: true });
      try {
        const saved = await window.guance.invoke('projects.save', { id: current.id, revision: current.revision, data });
        useDesktopState.setState({ current: saved, error: '' });
      } catch (error) {
        pending = undefined;
        const message = error instanceof Error ? error.message : '保存失败';
        try { applyProject(await window.guance.invoke('projects.load', { id: current.id })); } catch { /* The error remains visible; do not substitute demo data. */ }
        useDesktopState.setState({ error: message }); toast(message.includes('CONFLICT') ? '检测到版本冲突，请到设置核对' : '保存失败，已恢复最近保存版本', message, 'danger'); throw error;
      } finally { useDesktopState.setState({ saving: false }); }
    }
  })();
  try { await activeSave; } finally { activeSave = undefined; }
}
export async function switchProject(id: string) {
  await flushDesktop(); if (!window.guance) return;
  applyProject(await window.guance.invoke('projects.load', { id }));
  localStorage.setItem('guance:last-project', id);
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
    pending = structuredClone((event as CustomEvent<AppData>).detail);
    void flushDesktop().catch(() => undefined);
  });
  window.addEventListener('guance:reset', () => {
    void (async () => { await flushDesktop(); const current = useDesktopState.getState().current; if (!current || !window.guance) return; applyProject(await window.guance.invoke('projects.resetDemo', { id: current.id })); })().catch((e: unknown) => toast('未恢复数据', e instanceof Error ? e.message : '操作失败', 'warning'));
  });
  let polling = false;
  window.setInterval(() => { if (polling || pending || activeSave) return; polling = true; void (async () => { const current = useDesktopState.getState().current; if (!current) return; const latest = await window.guance!.invoke('projects.load', { id: current.id }); if (!pending && !activeSave && useDesktopState.getState().current?.id === current.id && useDesktopState.getState().current?.revision === current.revision && latest.revision !== current.revision) { applyProject(latest); await refreshProjects(); } })().catch((e: unknown) => useDesktopState.setState({ error: String(e) })).finally(() => { polling = false; }); }, 2000);
}
