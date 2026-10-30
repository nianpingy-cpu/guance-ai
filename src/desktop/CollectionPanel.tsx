import { useEffect, useRef, useState } from 'react';
import { useAppStore } from '@/store/appStore';
import { useUiStore } from '@/store/ui';
import { refreshProject, flushDesktop, useDesktopState } from './client';
import type { Job } from '@/types/desktop';
import { Field, InfoBanner } from '@/components/ui/Form';
import { Button } from '@/components/ui/Button';
export function CollectionPanel() {
  const projectId = useDesktopState((s) => s.current?.id); const feedback = useAppStore((s) => s.feedbackTasks);
  const [kind, setKind] = useState<'web' | 'rss'>('rss'); const [url, setUrl] = useState(''); const [trigger, setTrigger] = useState(''); const [jobs, setJobs] = useState<Job[]>([]); const [message, setMessage] = useState('');
  const scopeRef = useRef({ projectId, active: true });
  if (scopeRef.current.projectId !== projectId) { scopeRef.current.active = false; scopeRef.current = { projectId, active: true }; }
  const scope = scopeRef.current;
  const isCurrent = () => scope.active && scopeRef.current === scope && useDesktopState.getState().current?.id === projectId;
  useEffect(() => { scope.active = true; let stopped = false; let running = false; setTrigger(''); setJobs([]); setMessage('');
    const poll = async () => { if (!projectId || !isCurrent()) return; try { const all = (await window.guance!.invoke('jobs.list', { projectId })).filter((j) => j.kind === 'collect' && j.projectId === projectId); if (stopped || !isCurrent()) return; const active = all.some((j) => j.status === 'running'); if (running && !active) await refreshProject(projectId); running = active; if (!stopped && isCurrent()) setJobs(all); } catch (e) { if (!stopped && isCurrent()) setMessage(String(e)); } };
    void poll(); const timer = window.setInterval(() => void poll(), 1000); return () => { stopped = true; scope.active = false; window.clearInterval(timer); };
  }, [projectId, scope]);
  const visibleJobs = jobs.filter(j => j.projectId === projectId);
  const start = async () => {
    if (!projectId || !isCurrent()) return;
    try {
      await flushDesktop(); if (!isCurrent()) return;
      const job = await window.guance!.invoke('collect.start', { projectId, kind, url, triggerTaskId: trigger || undefined });
      if (!isCurrent()) return;
      if (job.projectId !== projectId) throw new Error('任务响应不属于当前项目');
      setJobs(old => [job, ...old]); setMessage('采集任务已建立');
    } catch (e) { if (isCurrent()) setMessage(String(e)); }
  };
  const cancel = async (job: Job) => {
    if (!isCurrent() || job.projectId !== projectId) return;
    try { await window.guance!.invoke('jobs.cancel', { id: job.id }); }
    catch (e) { if (isCurrent()) setMessage(String(e)); }
  };
  const retry = async (job: Job) => {
    if (!isCurrent() || job.projectId !== projectId) return;
    try {
      const next = await window.guance!.invoke('collect.retry', { id: job.id });
      if (!isCurrent()) return;
      if (next.projectId !== projectId) throw new Error('任务响应不属于当前项目');
      setJobs(old => [next, ...old]);
    } catch (e) { if (isCurrent()) setMessage(String(e)); }
  };
  return <details className="print-hide mx-4 my-5 rounded-xl border border-line bg-white p-5 sm:mx-8"><summary className="cursor-pointer text-sm font-semibold">高级采集 · RSS / 公开网页订阅</summary><div className="mt-4 space-y-4"><p className="text-xs leading-6 text-muted">普通用户请优先使用市场情报页的“粘贴添加”：复制公众号文章链接或抖音/小红书文案即可，不需要登录或密钥。这里适合企业已有 RSS/Atom 订阅源或固定公开网页；每次最多读取100条，入库前去重，不绕过登录。</p>
    <div className="grid gap-3 sm:grid-cols-[140px_1fr]"><Field label="采集方式" htmlFor="collect-kind"><select id="collect-kind" className="input" value={kind} onChange={(e) => setKind(e.target.value as 'web' | 'rss')}><option value="rss">RSS / Atom</option><option value="web">公开网页</option></select></Field><Field label="公开来源地址" htmlFor="collect-url"><input id="collect-url" className="input" type="url" placeholder="https://…" value={url} onChange={(e) => setUrl(e.target.value)} /></Field></div>
    <Field label="关联复盘建议（可选）" htmlFor="collect-trigger"><select id="collect-trigger" className="input" value={trigger} onChange={(e) => setTrigger(e.target.value)}><option value="">独立采集任务</option>{feedback.filter((t) => t.status === 'open').map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}</select></Field>
    <div className="flex flex-wrap gap-2"><Button variant="primary" disabled={!url || visibleJobs.some((j) => j.status === 'running')} onClick={() => void start()}>开始采集</Button><Button onClick={() => useUiStore.getState().openSettings('企业技术接入')}>企业技术接入（普通用户无需）</Button></div>
    {message && <InfoBanner>{message}</InfoBanner>}{visibleJobs.slice(0, 8).map((j) => <InfoBanner key={j.id} title={`${j.createdAt} · ${j.status}`}><p>{j.error ?? j.result ?? j.progress}</p>{j.status === 'running' ? <Button size="sm" onClick={() => void cancel(j)}>取消</Button> : j.status !== 'completed' && <Button size="sm" onClick={() => void retry(j)}>手动重试 / 恢复</Button>}</InfoBanner>)}
  </div></details>;
}
