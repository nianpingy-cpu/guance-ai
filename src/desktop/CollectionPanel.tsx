import { useEffect, useState } from 'react';
import { useAppStore } from '@/store/appStore';
import { useUiStore } from '@/store/ui';
import { applyProject, flushDesktop, useDesktopState } from './client';
import type { Job } from '@/types/desktop';
import { Field, InfoBanner } from '@/components/ui/Form';
import { Button } from '@/components/ui/Button';
export function CollectionPanel() {
  const projectId = useDesktopState((s) => s.current?.id); const feedback = useAppStore((s) => s.feedbackTasks);
  const [kind, setKind] = useState<'web' | 'rss'>('rss'); const [url, setUrl] = useState(''); const [trigger, setTrigger] = useState(''); const [jobs, setJobs] = useState<Job[]>([]); const [message, setMessage] = useState('');
  useEffect(() => { let stopped = false; let running = false; setTrigger('');
    const poll = async () => { if (!projectId) return; try { const all = (await window.guance!.invoke('jobs.list', { projectId })).filter((j) => j.kind === 'collect'); if (stopped) return; const active = all.some((j) => j.status === 'running'); if (running && !active) { await flushDesktop(); if (useDesktopState.getState().current?.id === projectId) applyProject(await window.guance!.invoke('projects.load', { id: projectId })); } running = active; setJobs(all); } catch (e) { if (!stopped) setMessage(String(e)); } };
    void poll(); const timer = window.setInterval(() => void poll(), 1000); return () => { stopped = true; window.clearInterval(timer); };
  }, [projectId]);
  return <details className="mx-4 my-5 rounded-xl border border-line bg-white p-5 sm:mx-8"><summary className="cursor-pointer text-sm font-semibold">采集与来源连接 · 公开网页 / RSS</summary><div className="mt-4 space-y-4"><p className="text-xs leading-6 text-muted">每次读取一个公开网页或最多100条RSS/Atom内容，入库前去重。应用关闭后任务中断，恢复运行需手动重试；不绕过平台登录。关键词采集仅在官方平台权限开通后提供。</p>
    <div className="grid gap-3 sm:grid-cols-[140px_1fr]"><Field label="采集方式" htmlFor="collect-kind"><select id="collect-kind" className="input" value={kind} onChange={(e) => setKind(e.target.value as 'web' | 'rss')}><option value="rss">RSS / Atom</option><option value="web">公开网页</option></select></Field><Field label="公开来源地址" htmlFor="collect-url"><input id="collect-url" className="input" type="url" placeholder="https://…" value={url} onChange={(e) => setUrl(e.target.value)} /></Field></div>
    <Field label="关联复盘建议（可选）" htmlFor="collect-trigger"><select id="collect-trigger" className="input" value={trigger} onChange={(e) => setTrigger(e.target.value)}><option value="">独立采集任务</option>{feedback.filter((t) => t.status === 'open').map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}</select></Field>
    <div className="flex flex-wrap gap-2"><Button variant="primary" disabled={!url || jobs.some((j) => j.status === 'running')} onClick={() => void (async () => { await flushDesktop(); const job = await window.guance!.invoke('collect.start', { projectId: projectId!, kind, url, triggerTaskId: trigger || undefined }); setJobs((old) => [job, ...old]); setMessage('采集任务已建立'); })().catch((e: unknown) => setMessage(String(e)))}>开始采集</Button><Button onClick={() => useUiStore.getState().setSettingsOpen(true)}>来源连接设置</Button></div>
    {message && <InfoBanner>{message}</InfoBanner>}{jobs.slice(0, 8).map((j) => <InfoBanner key={j.id} title={`${j.createdAt} · ${j.status}`}><p>{j.error ?? j.result ?? j.progress}</p>{j.status === 'running' ? <Button size="sm" onClick={() => void window.guance!.invoke('jobs.cancel', { id: j.id }).catch((e: unknown) => setMessage(String(e)))}>取消</Button> : j.status !== 'completed' && <Button size="sm" onClick={() => void window.guance!.invoke('collect.retry', { id: j.id }).then((next) => setJobs((old) => [next, ...old])).catch((e: unknown) => setMessage(String(e)))}>手动重试 / 恢复</Button>}</InfoBanner>)}
  </div></details>;
}
