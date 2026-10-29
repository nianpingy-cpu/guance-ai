import { useEffect, useState } from 'react';
import type { SyncStatus } from '@/types/desktop';
import { Field, InfoBanner } from '@/components/ui/Form';
import { Button } from '@/components/ui/Button';
import { flushDesktop, refreshProjects, switchProject, useDesktopState } from './client';
import { formatCny } from '@/lib/format';
import { exportSnapshot } from '@/data/repository';
import { webdavGuides } from './webdavGuides';

function download(text: string, filename: string) { const url = URL.createObjectURL(new Blob([text], { type: 'application/json' })); const a = document.createElement('a'); a.href = url; a.download = filename; a.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000); }
function makePassphrase() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const bytes = new Uint8Array(20);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (value) => alphabet[value % alphabet.length]).join('').match(/.{1,4}/g)!.join('-');
}
function formatTime(value?: string) {
  if (!value) return '尚未同步';
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? value : date.toLocaleString('zh-CN', { hour12: false });
}

export function SyncSettings() {
  const [status, setStatus] = useState<SyncStatus>(); const [url, setUrl] = useState(''); const [username, setUsername] = useState(''); const [password, setPassword] = useState(''); const [passphrase, setPassphrase] = useState(''); const [automatic, setAutomatic] = useState(false); const [busy, setBusy] = useState(false); const [message, setMessage] = useState('');
  const [showPhrase, setShowPhrase] = useState(false);
  const refresh = async () => setStatus(await window.guance!.invoke('sync.status', undefined));
  useEffect(() => { void window.guance!.invoke('sync.status', undefined).then((s) => { setStatus(s); setUrl(s.url); setUsername(s.username); setAutomatic(s.automatic); }).catch((e: unknown) => setMessage(String(e))); const timer = window.setInterval(() => void refresh().catch(() => undefined), 2000); return () => window.clearInterval(timer); }, []);
  const run = async (fn: () => Promise<void>) => { setBusy(true); setMessage(''); try { await flushDesktop(); await fn(); await refresh(); await refreshProjects(); const id = useDesktopState.getState().current?.id; if (id) await switchProject(id); } catch (e) { setMessage(e instanceof Error ? e.message : '同步失败'); } finally { setBusy(false); } };
  const normalizedUrl = url.trim().replace(/\/$/, '');
  const configuredUrl = (status?.url ?? '').replace(/\/$/, '');
  const directoryChanged = Boolean(status?.configured && normalizedUrl !== configuredUrl);
  const accountChanged = Boolean(status?.configured && username.trim() !== status.username);
  const originChanged = (() => { try { return Boolean(status?.configured && normalizedUrl && new URL(normalizedUrl).origin !== new URL(status.url).origin); } catch { return false; } })();
  const needsPassword = !status?.configured || accountChanged || originChanged;
  const needsPassphrase = !status?.configured || directoryChanged;
  const canSave = Boolean(normalizedUrl && username.trim()) && (!needsPassword || Boolean(password)) && (!needsPassphrase || passphrase.length >= 12) && (passphrase.length === 0 || passphrase.length >= 12);
  const saveAndTest = async () => {
    setBusy(true); setMessage('');
    try {
      await flushDesktop();
      await window.guance!.invoke('sync.configure', { url, username, password, passphrase, automatic });
      setPassword(''); setPassphrase(''); setShowPhrase(false);
      setMessage('配置已保存，正在测试连接并初始化目录…');
      const result = await window.guance!.invoke('sync.test', undefined);
      await refresh(); await refreshProjects();
      const id = useDesktopState.getState().current?.id; if (id) await switchProject(id);
      setMessage(`${result}。现在可以点“立即同步”。`);
    } catch (e) {
      await refresh().catch(() => undefined);
      setMessage(`保存或测试未完成：${e instanceof Error ? e.message : '请检查填写内容'}`);
    } finally { setBusy(false); }
  };
  const copyPhrase = async (text: string, success: string) => {
    try {
      if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); setMessage(success); return; }
    } catch { /* 系统剪贴板不可用时改用下面的兼容方案 */ }
    try {
      const area = document.createElement('textarea'); area.value = text; area.setAttribute('readonly', ''); area.style.position = 'fixed'; area.style.opacity = '0'; document.body.append(area); area.select();
      const copied = document.execCommand('copy'); area.remove();
      if (!copied) throw new Error('copy unavailable');
      setMessage(success);
    } catch { setMessage('无法自动复制，请选中口令输入框后手动复制。'); }
  };
  const generatePhrase = () => {
    const value = makePassphrase();
    setPassphrase(value); setShowPhrase(true);
    void copyPhrase(value, '同步口令已生成并复制。请保存到密码管理器；第二台设备必须填写完全相同的口令。');
  };
  const saveOnly = () => void run(async () => { await window.guance!.invoke('sync.configure', { url, username, password, passphrase, automatic }); setPassword(''); setPassphrase(''); setShowPhrase(false); setMessage('配置已保存。可点“保存并测试连接”验证目录和口令。'); });
  return <div className="space-y-4">
    <p className="text-xs leading-6 text-muted">WebDAV 可以理解成“属于你的网络文件夹”，用来在两台电脑之间同步加密后的项目版本。它不是必填项；不配置也能正常使用本应用，只是不能跨设备同步。模型密钥、平台凭据、WebDAV 密码和同步口令不会上传到远端。</p>

    <InfoBanner tone="brand" title="三步完成（不用手动建文件夹）">
      <ol className="list-decimal space-y-1 pl-5">
        <li>填 WebDAV 地址、用户名和密码。地址要是“目录”，不是网盘网页地址或分享链接。</li>
        <li>点“生成同步口令”，把口令保存到密码管理器；第二台设备要填同一段。</li>
        <li>点“保存并测试连接”，成功后点“立即同步”。应用会自动创建 guance-v1 专用子目录。</li>
      </ol>
    </InfoBanner>

    <InfoBanner title="从0.6.1及更早版本升级同步">先导出项目备份，所有设备升级后，再配置同一个新的空 WebDAV 目录。旧目录保持不变，本机项目和历史审批仍保留；不同设备的版本无法确定先后时会保留冲突供核对。</InfoBanner>
    {(message || status?.error) && <InfoBanner tone={message.includes('未完成') ? 'warning' : 'neutral'}>{message || status?.error}</InfoBanner>}

    <div className="rounded-xl border border-[#d9e3ef] bg-[#f5f8fc] px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div><p className="text-[12px] font-semibold text-ink">第一次用？推荐坚果云</p><p className="mt-0.5 text-[11px] leading-5 text-muted">先生成坚果云的“应用密码”，再把下面的地址填进去。</p></div>
        <div className="flex flex-wrap gap-2"><Button size="sm" onClick={() => setUrl('https://dav.jianguoyun.com/dav/')}>填入坚果云地址</Button><a href="https://help.jianguoyun.com/?s=WebDAV" target="_blank" rel="noreferrer" className="inline-flex items-center text-[11px] font-semibold text-brand underline">如何生成应用密码 ↗</a></div>
      </div>
    </div>

    <div className="grid gap-2 sm:grid-cols-3">
      <div className="rounded-lg border border-line bg-[#f8fafc] px-3 py-2"><p className="text-[11px] text-muted">同步状态</p><p className="text-sm font-semibold text-ink">{status?.configured ? '已配置' : '未配置'}</p></div>
      <div className="rounded-lg border border-line bg-[#f8fafc] px-3 py-2"><p className="text-[11px] text-muted">最近成功</p><p className="text-sm font-semibold text-ink">{formatTime(status?.lastSuccess)}</p></div>
      <div className="rounded-lg border border-line bg-[#f8fafc] px-3 py-2"><p className="text-[11px] text-muted">运行状态</p><p className="text-sm font-semibold text-ink">{status?.busy || busy ? '处理中…' : '空闲'}</p></div>
    </div>

    <Field label="WebDAV 目录地址" htmlFor="dav-url" hint="必须是 HTTPS 目录，且有写入权限。可带末尾斜杠；不要填带 ? 或 # 的分享链接。">
      <input id="dav-url" className="input" type="url" autoComplete="off" placeholder="https://dav.jianguoyun.com/dav/" value={url} onChange={(e) => setUrl(e.target.value)} />
    </Field>
    <Field label="WebDAV 用户名" htmlFor="dav-user" hint="通常是登录邮箱或网盘用户名，不是昵称。">
      <input id="dav-user" className="input" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} />
    </Field>
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="WebDAV 密码" htmlFor="dav-password" hint={needsPassword ? '首次配置或更换站点/账号时必须填写。建议使用网盘的“应用密码”，不要用网页登录密码。' : '留空保留同一站点、同一账号的密码；更换站点或账号时请重填。'}>
        <input id="dav-password" className="input" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
      </Field>
      <Field label="独立同步口令（至少12位）" htmlFor="dav-phrase" hint={needsPassphrase ? '首次配置或更换目录时必须填写。它用来加密远端文件，不是 WebDAV 密码；丢失后无法解密。' : '两台设备必须填同一段。留空表示沿用本机已保存的口令。'}>
        <div className="flex flex-wrap gap-1.5">
          <input id="dav-phrase" className="input min-w-0 flex-1" type={showPhrase ? 'text' : 'password'} autoComplete="new-password" value={passphrase} onChange={(e) => setPassphrase(e.target.value)} />
          <Button size="sm" onClick={() => setShowPhrase((value) => !value)}>{showPhrase ? '隐藏' : '显示'}</Button>
          <Button size="sm" onClick={generatePhrase}>生成</Button>
          <Button size="sm" disabled={!passphrase} onClick={() => void copyPhrase(passphrase, '同步口令已复制。请保存到密码管理器。')}>复制</Button>
        </div>
      </Field>
    </div>
    {!canSave && (needsPassword && !password || needsPassphrase && passphrase.length < 12 || passphrase.length > 0 && passphrase.length < 12) && <p className="text-[11px] leading-5 text-[#7b5718]">首次配置或更换目录/账号时：请补全 WebDAV 密码和至少12位同步口令。已有配置只改自动同步时，密码和口令可以留空。</p>}
    <label className="flex gap-2 text-xs leading-6"><input type="checkbox" checked={automatic} onChange={(e) => setAutomatic(e.target.checked)} />应用运行期间每分钟自动同步</label>

    <div className="flex flex-wrap gap-2">
      <Button variant="primary" disabled={busy || Boolean(status?.busy) || !canSave} onClick={() => void saveAndTest()}>{busy ? '处理中…' : '保存并测试连接'}</Button>
      <Button disabled={busy || Boolean(status?.busy) || !canSave} onClick={saveOnly}>仅保存配置</Button>
      <Button disabled={busy || !status?.configured || status.busy} onClick={() => void run(async () => { await window.guance!.invoke('sync.run', undefined); setMessage('本次同步已完成，请检查下方冲突列表。'); })}>{busy || status?.busy ? '同步处理中…' : '立即同步'}</Button>
      <Button disabled={busy || status?.busy} onClick={() => void run(async () => { await window.guance!.invoke('sync.disconnect', undefined); setMessage('已停用同步并删除本机同步凭据；本机业务数据保留。'); })}>停用并删除凭据</Button>
    </div>

    <details className="rounded-xl border border-line bg-[#f8fafc] p-4">
      <summary className="cursor-pointer text-sm font-semibold text-ink">不知道地址怎么填？看坚果云 / Nextcloud / 群晖示例</summary>
      <div className="mt-3 space-y-3">
        {webdavGuides.map((guide) => <div key={guide.id} className="rounded-lg border border-line bg-white p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[13px] font-semibold text-ink">{guide.name}{guide.recommended ? ' · 推荐' : ''}</p>
            <Button size="sm" onClick={() => setUrl(guide.url)}>{guide.id === 'jianguoyun' ? '填入这个地址' : '填入地址模板'}</Button>
          </div>
          <div className="mt-2 space-y-1 text-[11px] leading-5 text-muted">
            <p>地址：<code className="break-all rounded bg-[#f1f5f4] px-1 py-0.5 text-ink">{guide.url}</code></p>
            <p>用户名：{guide.account}</p>
            <p>密码：{guide.password}</p>
          </div>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-[11px] leading-5 text-muted">{guide.steps.map((step) => <li key={step}>{step}</li>)}</ol>
          <a href={guide.link} target="_blank" rel="noreferrer" className="mt-2 inline-block text-[11px] font-semibold text-brand underline">{guide.linkLabel} ↗</a>
        </div>)}
      </div>
    </details>

    <p className="text-xs leading-6 text-muted">最后成功：{formatTime(status?.lastSuccess)}。关闭应用后停止自动同步。两台设备分别配置模型和平台凭据；业务数据、复盘与待办会同步。</p>
    {status?.conflicts.map((c) => <InfoBanner key={c.id} tone="warning" title={`${c.name} · 版本冲突`}><p className="break-all">本机预算 {formatCny(c.localBudgetCents)}；远端预算 {formatCny(c.remoteBudgetCents)}；远端版本 {c.remoteRevision.slice(0, 12)} · {c.remoteUpdatedAt}</p><p className="mt-2">此处选择整个项目版本。处理前自动备份，并把未选版本保留为独立“冲突保留”项目。同步不会自动覆盖冲突。</p><div className="mt-3 flex flex-wrap gap-2"><Button size="sm" disabled={busy} onClick={() => void run(async () => { const p = await window.guance!.invoke('sync.preview', { id: c.id }); download(exportSnapshot(p.local.data), '冲突-本机版本.json'); download(exportSnapshot(p.remote.data), '冲突-远端版本.json'); setMessage('已导出两端完整业务版本供核对，不含连接凭据'); })}>导出两端版本供核对</Button>{(['local', 'remote'] as const).map((choice) => <Button key={choice} size="sm" disabled={busy || status.busy} onClick={() => void run(async () => { await window.guance!.invoke('sync.resolve', { id: c.id, choice }); setMessage('冲突已处理，未选版本保存为独立项目；请再同步一次传递处理结果'); })}>{choice === 'local' ? '采用本机版本' : '采用此远端版本'}</Button>)}</div></InfoBanner>)}
  </div>;
}
