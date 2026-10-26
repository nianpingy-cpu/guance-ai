import { useEffect, useState } from 'react';
import { useAppStore } from '@/store/appStore';
import { useUiStore } from '@/store/ui';
import { applyProject, flushDesktop, useDesktopState } from './client';
import type { Job } from '@/types/desktop';
import { Button } from '@/components/ui/Button';
import { InfoBanner } from '@/components/ui/Form';

export function AnalysisPanel() {
  const signals = useAppStore((s) => s.signals); const analyses = useAppStore((s) => s.analyses ?? []);
  const projectId = useDesktopState((s) => s.current?.id);
  const [selected, setSelected] = useState<string[]>([]); const [jobs, setJobs] = useState<Job[]>([]); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  useEffect(() => { setSelected([]); let cancelled = false; let previousRunning = false;
    const poll = async () => { if (!projectId) return; try { const list = await window.guance!.invoke('jobs.list', { projectId }); if (cancelled) return; const running = list.some((j) => j.status === 'running'); if (previousRunning && !running) { await flushDesktop(); if (useDesktopState.getState().current?.id === projectId) applyProject(await window.guance!.invoke('projects.load', { id: projectId })); } previousRunning = running; setJobs(list); } catch (e) { if (!cancelled) setError(String(e)); } };
    void poll(); const interval = window.setInterval(() => void poll(), 1000); return () => { cancelled = true; window.clearInterval(interval); };
  }, [projectId]);
  const active = jobs.find((j) => j.status === 'running');
  return <details className="mx-4 my-5 rounded-xl border border-line bg-white p-5 sm:mx-8"><summary className="cursor-pointer text-sm font-semibold">模型分析 · 选择情报生成主题与 A/B 方案</summary><div className="mt-4 space-y-4">
    <p className="text-xs leading-6 text-muted">只发送所选情报与当前企业资料。生成成功将更新当前主题与两套方案，审批历史保留；结果仍需人工核实。任务运行中修改依据会阻止覆盖。</p>
    <Button size="sm" onClick={() => useUiStore.getState().setSettingsOpen(true)}>配置模型连接</Button>
    <div className="max-h-56 space-y-2 overflow-auto border-y border-line py-3">{signals.map((s) => <label key={s.id} className="flex gap-2 text-xs leading-6"><input type="checkbox" checked={selected.includes(s.id)} onChange={(e) => setSelected(e.target.checked ? [...selected, s.id].slice(0, 100) : selected.filter((id) => id !== s.id))} /><span>{s.id} · {s.title}</span></label>)}{!signals.length && <p className="text-xs text-muted">请先在市场情报导入或采集真实资料。</p>}</div>
    <Button variant="primary" disabled={busy || Boolean(active) || !selected.length} onClick={() => { setBusy(true); setError(''); void (async () => { await flushDesktop(); const job = await window.guance!.invoke('models.analyze', { projectId: projectId!, signalIds: selected }); setJobs((old) => [job, ...old]); })().catch((e: unknown) => setError(String(e))).finally(() => setBusy(false)); }}>使用 {selected.length} 条情报生成（可能计费）</Button>
    {error && <InfoBanner tone="danger">{error}</InfoBanner>}
    {jobs.slice(0, 5).map((j) => <InfoBanner key={j.id} title={`${j.kind === 'analysis' ? '模型分析' : '采集'} · ${j.status}`}><p>{j.error ?? j.result ?? j.progress}</p>{j.status === 'running' && <Button className="mt-2" size="sm" onClick={() => void window.guance!.invoke('jobs.cancel', { id: j.id }).catch((e: unknown) => setError(String(e)))}>取消任务</Button>}</InfoBanner>)}
    {analyses.slice(-3).map((a) => <p key={a.id} className="break-words text-xs leading-6 text-muted">{a.createdAt} · {a.provider}/{a.model} · {a.promptVersion} · 引用 {a.evidenceSignalIds.join('、')}；原始生成版本保存在项目备份中。</p>)}
  </div></details>;
}
