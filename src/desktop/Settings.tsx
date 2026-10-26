import { useState } from 'react';
import { Modal } from '@/components/ui/Overlay';
import { Button } from '@/components/ui/Button';
import { Field, InfoBanner } from '@/components/ui/Form';
import { useUiStore } from '@/store/ui';
import { applyProject, flushDesktop, refreshProjects, switchProject, useDesktopState } from './client';
import { isAppData } from '@/data/repository';
import { ModelSettings } from './ModelSettings';
import { ConnectionSettings } from './ConnectionSettings';

export function Settings() {
  const open = useUiStore((s) => s.settingsOpen);
  const close = () => useUiStore.getState().setSettingsOpen(false);
  const { current, projects, error: saveError } = useDesktopState();
  const [tab, setTab] = useState('项目与备份');
  const [name, setName] = useState('');
  const [mode, setMode] = useState<'real' | 'demo'>('real');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [imported, setImported] = useState<{ name: string; data: unknown; summary: string }>();
  const run = async (operation: () => Promise<void>) => { setBusy(true); setMessage(''); try { await operation(); } catch (e) { setMessage(e instanceof Error ? e.message : '操作失败'); } finally { setBusy(false); } };
  return <Modal open={open} onClose={close} size="lg" title="设置" description="业务数据保存到本机。演示项目与真实项目独立管理。">
    <div className="mb-5 flex flex-wrap gap-2 border-b border-line pb-3">{['项目与备份', '模型连接', '来源连接'].map((t) => <Button key={t} onClick={() => setTab(t)} variant={tab === t ? 'primary' : 'secondary'}>{t}</Button>)}</div>
    {tab === '模型连接' && <ModelSettings />}
    {tab === '来源连接' && <ConnectionSettings />}
    {(message || saveError) && <InfoBanner className="mb-4" tone="warning">{message || saveError}</InfoBanner>}
    {tab === '项目与备份' && <div className="space-y-5">
      <Field label="当前项目" htmlFor="current-project"><select id="current-project" className="input" value={current?.id ?? ''} disabled={busy} onChange={(e) => void run(() => switchProject(e.target.value))}>{projects.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.mode === 'demo' ? '演示' : '业务'}</option>)}</select></Field>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_120px_auto] sm:items-end"><Field label="新项目名称" htmlFor="project-name"><input id="project-name" className="input" maxLength={200} value={name} onChange={(e) => setName(e.target.value)} /></Field><Field label="项目类型" htmlFor="project-mode"><select id="project-mode" className="input" value={mode} onChange={(e) => setMode(e.target.value as 'real' | 'demo')}><option value="real">真实业务</option><option value="demo">演示案例</option></select></Field><Button disabled={busy || !name.trim()} onClick={() => void run(async () => { await flushDesktop(); const p = await window.guance!.invoke('projects.create', { name, mode }); applyProject(p); await refreshProjects(); setName(''); setMessage('项目已创建并切换'); })}>创建项目</Button></div>
      <div className="border-t border-line pt-4"><Button disabled={busy} onClick={() => void run(async () => { await flushDesktop(); const b = await window.guance!.invoke('projects.backup', undefined); setMessage(`本机数据库备份已保存：${b.filename}（应用数据目录 / data / backups）`); })}>备份本机数据库</Button><p className="mt-2 text-xs leading-6 text-muted">可迁移备份请使用左侧“导出当前任务 JSON”。导入在新项目中完成，并自动备份当前数据库。</p></div>
      <Field label="导入项目 JSON（先预览）" htmlFor="project-file"><input id="project-file" type="file" accept=".json,application/json" disabled={busy} onChange={(e) => void run(async () => { const file = e.target.files?.[0]; if (!file) return; if (file.size > 20_000_000) throw new Error('文件不能超过20MB'); const raw: unknown = JSON.parse(await file.text()); const data = raw && typeof raw === 'object' && 'data' in raw ? raw.data : raw; if (!isAppData(data)) throw new Error('不是受支持的观策AI项目备份'); setImported({ name: file.name.replace(/\.json$/i, ''), data, summary: `${data.company.name}；${data.signals.length}条情报；${data.approvals.length}份审批；${data.reviews.length}份复盘` }); })} /></Field>
      {imported && <InfoBanner title="导入预览">{imported.summary}<div className="mt-3"><Button disabled={busy} onClick={() => void run(async () => { await flushDesktop(); const p = await window.guance!.invoke('projects.import', { name: imported.name, snapshot: imported.data }); applyProject(p); await refreshProjects(); setImported(undefined); setMessage('导入完成，已进行完整校验；相同数据不会重复建立项目。'); })}>校验并导入新项目</Button></div></InfoBanner>}
    </div>}
  </Modal>;
}
