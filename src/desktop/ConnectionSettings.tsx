import { useEffect, useState } from 'react';
import type { Connection, Platform } from '@/types/desktop';
import { Field, InfoBanner } from '@/components/ui/Form';
import { Button } from '@/components/ui/Button';
export function ConnectionSettings() {
  const [connections, setConnections] = useState<Connection[]>([]); const [selected, setSelected] = useState<Platform>('douyin'); const [appId, setAppId] = useState(''); const [secret, setSecret] = useState(''); const [message, setMessage] = useState('');
  const refresh = async () => setConnections(await window.guance!.invoke('connections.list', undefined));
  useEffect(() => { void refresh().catch((e: unknown) => setMessage(String(e))); }, []);
  return <div className="space-y-4"><InfoBanner title="官方平台 · 待开通">当前可用采集为公开网页、RSS及文件导入。保存应用凭据后仍需完成获批权限核查与适配器测试；本版本不会把这些平台显示为已接通。</InfoBanner>{connections.map((c) => <section key={c.id} className="border-b border-line pb-4"><p className="text-sm font-semibold">{c.name} · {c.status} {c.hasSecret && '· 凭据已保存'}</p><p className="mt-1 text-xs leading-6 text-muted">{c.description}</p><a href={c.link} target="_blank" rel="noreferrer" className="text-xs text-brand underline">查看官方能力与权限</a></section>)}
    <Field label="官方应用平台" htmlFor="platform-select"><select id="platform-select" className="input" value={selected} onChange={(e) => { const p = e.target.value as Platform; setSelected(p); setAppId(connections.find((c) => c.id === p)?.appId ?? ''); setSecret(''); }}><option value="douyin">抖音</option><option value="wechat">微信公众号</option><option value="xiaohongshu">小红书</option></select></Field>
    <Field label="应用 ID" htmlFor="platform-appid"><input id="platform-appid" className="input" value={appId} onChange={(e) => setAppId(e.target.value)} /></Field><Field label="应用密钥" htmlFor="platform-secret" hint="系统加密保存在本机；同一应用 ID 留空可保留凭据，更换 ID 须重新填写密钥。"><input id="platform-secret" className="input" type="password" autoComplete="off" value={secret} onChange={(e) => setSecret(e.target.value)} /></Field>
    <div className="flex flex-wrap gap-2"><Button disabled={!appId.trim()} onClick={() => void window.guance!.invoke('connections.save', { platform: selected, appId, secret }).then(async () => { setSecret(''); setMessage('凭据已保存，平台仍待开通与验权'); await refresh(); }).catch((e: unknown) => setMessage(String(e)))}>保存本机凭据</Button><Button onClick={() => void window.guance!.invoke('connections.remove', { platform: selected }).then(async () => { setSecret(''); setAppId(''); setMessage('凭据已删除'); await refresh(); }).catch((e: unknown) => setMessage(String(e)))}>删除凭据</Button></div>{message && <InfoBanner>{message}</InfoBanner>}
  </div>;
}
