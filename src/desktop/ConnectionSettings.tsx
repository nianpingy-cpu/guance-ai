import { useEffect, useState } from 'react';
import type { Connection, Platform } from '@/types/desktop';
import { Field, InfoBanner } from '@/components/ui/Form';
import { Button } from '@/components/ui/Button';
import { platformGuide, platformGuides } from './platformGuides';

export function ConnectionSettings() {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [selected, setSelected] = useState<Platform>('douyin');
  const [appId, setAppId] = useState('');
  const [secret, setSecret] = useState('');
  const [message, setMessage] = useState('');
  const guide = platformGuide(selected);
  const saved = connections.find((c) => c.id === selected);
  const refresh = async () => { const list = await window.guance!.invoke('connections.list', undefined); setConnections(list); return list; };
  useEffect(() => { void refresh().then((list) => setAppId(list.find((c) => c.id === selected)?.appId ?? '')).catch((e: unknown) => setMessage(String(e))); }, []);
  const choose = (platform: Platform) => {
    setSelected(platform);
    setAppId(connections.find((c) => c.id === platform)?.appId ?? '');
    setSecret('');
    setMessage('');
  };
  const needsSecret = !saved?.hasSecret || appId.trim() !== saved.appId;
  return <div className="space-y-4">
    <InfoBanner tone="brand" title="普通用户不用填这一页">
      请直接去「市场情报 → 粘贴添加」：公众号文章链接、抖音/小红书分享文案都能保存。<strong>不需要登录平台账号，也不需要 AppID 或密钥。</strong> 本页只给公司开发人员、服务商或平台代理接入官方企业接口时使用。
    </InfoBanner>

    <div className="grid gap-3 sm:grid-cols-3">
      {platformGuides.map((item) => {
        const state = connections.find((c) => c.id === item.id);
        return <section key={item.id} className={`rounded-xl border p-4 ${selected === item.id ? 'border-brand bg-[#f5f8fc]' : 'border-line bg-white'}`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-left text-sm font-semibold text-ink">{item.name}</p>
            <span className="rounded-full bg-[#fdf8ee] px-2 py-0.5 text-[11px] font-semibold text-[#7b5718]">企业接口待开通</span>
          </div>
          <p className="mt-2 text-[11px] leading-5 text-muted">普通用户无需填写，也不需要用这里登录。</p>
          <p className="mt-1 break-all text-[11px] leading-5 text-muted">应用ID：{state?.appId || '未填写'}</p>
          <p className="text-[11px] leading-5 text-muted">密钥：{state?.hasSecret ? '已加密保存' : '未填写'}</p>
          <a href={item.loginUrl} target="_blank" rel="noreferrer" className="mt-2 inline-block text-[11px] font-semibold text-brand underline">{item.loginLabel} ↗</a>
        </section>;
      })}
    </div>

    <details className="rounded-xl border border-line bg-[#f8fafc] p-4">
      <summary className="cursor-pointer text-sm font-semibold text-ink">企业技术接入：填写 AppID / AppSecret（需要开发人员）</summary>
      <div className="mt-3 space-y-4">
        <InfoBanner tone="warning" title="这不是账号密码，个人用户请忽略">
          <strong>应用ID / 密钥不是账号密码。</strong> 它们要由公司的开发人员或服务商在官方开放平台创建应用后获取；不要填公众号密码、抖音号密码、小红书密码或验证码。保存凭据不会启用采集，也不会自动登录；官方数据适配器仍待开通。
        </InfoBanner>

        <section className="rounded-xl border border-line bg-white p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-ink">{guide.name}：去哪里找这两项？</h3>
              <p className="mt-1 text-[11px] leading-5 text-muted">先由技术人员登录官方后台，按下面顺序复制；不要从搜索引擎或第三方教程里找“共享密钥”。</p>
            </div>
            <a href={guide.docsUrl} target="_blank" rel="noreferrer" className="shrink-0 text-[11px] font-semibold text-brand underline">{guide.docsLabel} ↗</a>
          </div>
          <ol className="mt-3 space-y-2 text-[12px] leading-6 text-muted">
            {guide.steps.map((step, index) => <li key={step} className="flex gap-2"><span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-navy text-[10px] font-bold text-white">{index + 1}</span><span>{step}</span></li>)}
          </ol>
          <p className="mt-3 rounded-lg bg-[#fdf8ee] px-3 py-2 text-[11px] leading-5 text-[#7b5718]">{guide.caution}</p>
        </section>

        <div className="space-y-4 border-t border-line pt-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-ink">拿到后填在这里（仅本机加密保存）</h3>
            <a href={guide.loginUrl} target="_blank" rel="noreferrer" className="text-[11px] font-semibold text-brand underline">{guide.loginLabel} ↗</a>
          </div>
          <Field label="官方应用平台" htmlFor="platform-select">
            <select id="platform-select" className="input" value={selected} onChange={(e) => choose(e.target.value as Platform)}>
              {platformGuides.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </Field>
          <Field label="应用 ID（AppID / App ID）" htmlFor="platform-appid" hint={guide.appIdHint}>
            <input id="platform-appid" className="input" autoComplete="off" placeholder={guide.appIdPlaceholder} value={appId} onChange={(e) => setAppId(e.target.value)} />
          </Field>
          <Field label={guide.secretLabel} htmlFor="platform-secret" hint={`${guide.secretHint} 同一应用 ID 留空可保留已存密钥；更换应用 ID 必须重新填写密钥。`}>
            <input id="platform-secret" className="input" type="password" autoComplete="off" placeholder={guide.secretPlaceholder} value={secret} onChange={(e) => setSecret(e.target.value)} />
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" disabled={!appId.trim() || (needsSecret && !secret.trim())} onClick={() => void window.guance!.invoke('connections.save', { platform: selected, appId, secret }).then(async () => { setSecret(''); setMessage('已保存到本机。注意：本版仍不会启用官方平台采集或登录。'); await refresh(); }).catch((e: unknown) => setMessage(String(e)))}>保存到本机</Button>
            <Button onClick={() => void window.guance!.invoke('connections.remove', { platform: selected }).then(async () => { setSecret(''); setAppId(''); setMessage('本机记录已删除；官方平台上的应用不受影响。'); await refresh(); }).catch((e: unknown) => setMessage(String(e)))}>删除本机记录</Button>
          </div>
          {message && <InfoBanner>{message}</InfoBanner>}
        </div>

        <details className="rounded-xl border border-line bg-white p-4">
          <summary className="cursor-pointer text-sm font-semibold text-ink">为什么没有“一键登录 / 直接登录”？</summary>
          <div className="mt-3 space-y-2 text-[12px] leading-6 text-muted">
            <p>官方登录需要三样东西：平台审核通过的应用、登记过的回调地址、以及本应用实现好的授权与数据适配器。当前版本三者都还没有完成，如果做一个按钮，只会跳到平台后失败，或者让人误以为已经接通。</p>
            <p>普通用户不需要等这些：直接使用「粘贴添加」，复制公众号文章链接或抖音/小红书文案即可。等官方平台授权和适配器验收通过后，再增加真正的授权登录入口。</p>
          </div>
        </details>
      </div>
    </details>
  </div>;
}
