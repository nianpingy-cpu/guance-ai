import { useEffect, useState } from 'react';
import type { Provider, ProviderInput, ModelProtocol } from '@/types/desktop';
import { Button } from '@/components/ui/Button';
import { Field, InfoBanner } from '@/components/ui/Form';
const empty: ProviderInput = { name: '', baseUrl: '', protocol: 'chat', model: '', models: [], apiKey: '' };
export function ModelSettings() {
  const [providers, setProviders] = useState<Provider[]>([]); const [defaultId, setDefault] = useState('');
  const [form, setForm] = useState<ProviderInput>(empty); const [message, setMessage] = useState(''); const [busy, setBusy] = useState(false);
  async function refresh() { const config = await window.guance!.invoke('models.list', undefined); setProviders(config.providers); setDefault(config.defaultId); }
  useEffect(() => { void refresh().catch((e: unknown) => setMessage(String(e))); }, []);
  async function run(fn: () => Promise<void>) { setBusy(true); setMessage(''); try { await fn(); await refresh(); } catch (e) { setMessage(e instanceof Error ? e.message : '操作失败'); } finally { setBusy(false); } }
  return <div className="space-y-4">
    <p className="text-xs leading-6 text-muted">密钥使用系统加密保存，仅用于你填写的服务地址。不会进入项目导出或同步。测试连接和生成会发送模型请求，可能计费。</p>
    {message && <InfoBanner>{message}</InfoBanner>}
    <div className="divide-y divide-line">{providers.map((p) => <div key={p.id} className="flex flex-wrap items-center gap-2 py-3"><div className="min-w-0 flex-1"><p className="break-words text-sm font-semibold">{p.name} {defaultId === p.id && '· 默认'}</p><p className="break-all text-xs text-muted">{p.model} · {p.hasKey ? '密钥已保存' : '未配置密钥'}</p></div><Button size="sm" disabled={busy} onClick={() => { setForm({ id: p.id, name: p.name, baseUrl: p.baseUrl, protocol: p.protocol, models: p.models, model: p.model, apiKey: '' }); setMessage(''); }}>编辑</Button><Button size="sm" disabled={busy} onClick={() => void run(async () => { await window.guance!.invoke('models.default', { id: p.id }); setMessage('默认模型已更新'); })}>设为默认</Button><Button size="sm" disabled={busy} onClick={() => void run(async () => { setMessage(await window.guance!.invoke('models.test', { id: p.id })); })}>测试连接（可能计费）</Button><Button size="sm" disabled={busy} onClick={() => void run(async () => { await window.guance!.invoke('models.remove', { id: p.id }); if (form.id === p.id) setForm(empty); setMessage('服务商已删除'); })}>删除</Button></div>)}</div>
    <div className="flex flex-wrap gap-2"><Button size="sm" onClick={() => setForm(empty)}>添加自定义服务商</Button><Button size="sm" onClick={() => setForm({ ...empty, name: 'DeepSeek', baseUrl: 'https://api.deepseek.com', model: '', models: [] })}>使用 DeepSeek 预设</Button></div>
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <Field label="显示名称" htmlFor="provider-name"><input id="provider-name" className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
      <Field label="协议" htmlFor="provider-protocol"><select id="provider-protocol" className="input" value={form.protocol} onChange={(e) => setForm({ ...form, protocol: e.target.value as ModelProtocol })}><option value="chat">OpenAI Chat Completions</option><option value="responses">OpenAI Responses</option><option value="anthropic">Anthropic Messages</option></select></Field>
      <Field label="接口基础地址" htmlFor="provider-url" hint="填基础路径，如 https://api.deepseek.com；其他服务可含 /v1。"><input id="provider-url" className="input" value={form.baseUrl} onChange={(e) => setForm({ ...form, baseUrl: e.target.value })} /></Field>
      <Field label="API 密钥" htmlFor="provider-key" hint={form.id ? '留空仅保留同一站点的密钥；换站点需重新填写。' : '仅保存在本机'}><input id="provider-key" className="input" type="password" autoComplete="off" value={form.apiKey ?? ''} onChange={(e) => setForm({ ...form, apiKey: e.target.value })} /></Field>
      <Field label="模型 ID" htmlFor="provider-model" hint="可手动填写服务商提供的准确模型ID。"><input id="provider-model" list="available-models" className="input" value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} /><datalist id="available-models">{form.models.map((m) => <option value={m} key={m} />)}</datalist></Field>
      <div className="flex flex-wrap items-end gap-2"><Button disabled={busy || !form.id} onClick={() => void run(async () => { const models = await window.guance!.invoke('models.discover', { id: form.id! }); setForm({ ...form, models }); setMessage(`获取到${models.length}个模型；在模型ID输入框选择并再次保存。接口不支持时可手填。`); })}>获取模型列表</Button><Button variant="primary" disabled={busy || !form.name.trim() || !form.baseUrl.trim()} onClick={() => void run(async () => { const p = await window.guance!.invoke('models.save', form); setForm({ ...form, id: p.id, apiKey: '' }); setMessage('配置已保存；可获取模型列表，选择ID后再保存、测试并设为默认'); })}>{busy ? '处理中…' : '保存服务商'}</Button></div>
    </div>
  </div>;
}
