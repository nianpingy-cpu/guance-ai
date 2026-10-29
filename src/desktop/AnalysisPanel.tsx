import { useEffect, useRef, useState } from 'react';
import { useAppStore } from '@/store/appStore';
import { useUiStore } from '@/store/ui';
import { refreshProject, flushDesktop, useDesktopState } from './client';
import type { Job } from '@/types/desktop';
import { Button } from '@/components/ui/Button';
import { InfoBanner } from '@/components/ui/Form';

export function AnalysisPanel() {
  const signals = useAppStore((s) => s.signals); const analyses = useAppStore((s) => s.analyses ?? []);
  const projectId = useDesktopState((s) => s.current?.id);
  const [selected, setSelected] = useState<string[]>([]); const [jobs, setJobs] = useState<Job[]>([]); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState('');
  const scopeRef = useRef({ projectId, active: true });
  if (scopeRef.current.projectId !== projectId) { scopeRef.current.active = false; scopeRef.current = { projectId, active: true }; }
  const scope = scopeRef.current;
  const isCurrent = () => scope.active && scopeRef.current === scope && useDesktopState.getState().current?.id === projectId;
  useEffect(() => { scope.active = true; setSelected([]); setQuery(''); setJobs([]); setError(''); setBusy(false); let cancelled = false; let previousRunning = false;
    const poll = async () => { if (!projectId || !isCurrent()) return; try { const list = (await window.guance!.invoke('jobs.list', { projectId })).filter(j => j.projectId === projectId); if (cancelled || !isCurrent()) return; const running = list.some((j) => j.status === 'running'); if (previousRunning && !running) await refreshProject(projectId); previousRunning = running; if (!cancelled && isCurrent()) setJobs(list); } catch (e) { if (!cancelled && isCurrent()) setError(String(e)); } };
    void poll(); const interval = window.setInterval(() => void poll(), 1000); return () => { cancelled = true; scope.active = false; window.clearInterval(interval); };
  }, [projectId, scope]);
  const visibleJobs = jobs.filter(j => j.projectId === projectId);
  const active = visibleJobs.find((j) => j.status === 'running');
  const analyze = async () => {
    if (!projectId || !isCurrent()) return; setBusy(true); setError('');
    try {
      await flushDesktop(); if (!isCurrent()) return;
      const job = await window.guance!.invoke('models.analyze', { projectId, signalIds: selected });
      if (!isCurrent()) return;
      if (job.projectId !== projectId) throw new Error('任务响应不属于当前项目');
      setJobs(old => [job, ...old]);
    } catch (e) { if (isCurrent()) setError(String(e)); }
    finally { if (isCurrent()) setBusy(false); }
  };
  const cancel = async (job: Job) => {
    if (!isCurrent() || job.projectId !== projectId) return;
    try { await window.guance!.invoke('jobs.cancel', { id: job.id }); }
    catch (e) { if (isCurrent()) setError(String(e)); }
  };
  return <details className="print-hide mx-4 my-5 rounded-xl border border-line bg-white p-5 sm:mx-8"><summary className="cursor-pointer text-sm font-semibold">模型分析 · 选择情报生成主题与 A/B 方案</summary><div className="mt-4 space-y-4">
    <p className="text-xs leading-6 text-muted">只发送所选情报与当前企业资料。生成成功将更新当前主题与两套方案，审批历史保留；结果仍需人工核实。任务运行中修改依据会阻止覆盖。</p>
    <Button size="sm" onClick={() => useUiStore.getState().openSettings('模型连接')}>配置模型连接</Button>
    <input aria-label="搜索待分析情报" className="input" placeholder="按编号或标题搜索；一次显示前100条" value={query} onChange={(e) => setQuery(e.target.value)} />
    <div className="max-h-56 space-y-2 overflow-auto border-y border-line py-3">{signals.filter((s) => `${s.id} ${s.title}`.includes(query)).slice(0, 100).map((s) => <label key={s.id} className="flex gap-2 text-xs leading-6"><input type="checkbox" checked={selected.includes(s.id)} onChange={(e) => setSelected(e.target.checked ? [...selected, s.id].slice(0, 100) : selected.filter((id) => id !== s.id))} /><span>{s.id} · {s.title}</span></label>)}{!signals.length && <p className="text-xs text-muted">请先在市场情报导入或采集真实资料。</p>}</div>
    <Button variant="primary" disabled={busy || Boolean(active) || !selected.length} onClick={() => void analyze()}>使用 {selected.length} 条情报生成（可能计费）</Button>
    {error && <InfoBanner tone="danger">{error}</InfoBanner>}
    {visibleJobs.slice(0, 5).map((j) => <InfoBanner key={j.id} title={`${j.kind === 'analysis' ? '模型分析' : '采集'} · ${j.status}`}><p>{j.error ?? j.result ?? j.progress}</p>{j.status === 'running' && <Button className="mt-2" size="sm" onClick={() => void cancel(j)}>取消任务</Button>}</InfoBanner>)}
    {analyses.slice(-3).map((a) => <p key={a.id} className="break-words text-xs leading-6 text-muted">{a.createdAt} · {a.provider}/{a.model} · {a.promptVersion} · 引用 {a.evidenceSignalIds.join('、')}；原始生成版本保存在项目备份中。</p>)}
  </div></details>;
}
