import { useEffect, useRef, useState } from 'react';
import type { DesktopCommands, Job, Platform } from '@/types/desktop';
import { refreshProject, flushDesktop, useDesktopState } from '@/desktop/client';
import { useUiStore } from '@/store/ui';
import { Modal } from '@/components/ui/Overlay';
import { Button } from '@/components/ui/Button';
import { Field, InfoBanner } from '@/components/ui/Form';

type Mode = 'wechat' | 'social' | 'login';
type SocialPlatform = 'douyin' | 'xiaohongshu' | 'wechat' | 'other';
type Tone = 'neutral' | 'warning' | 'success' | 'danger' | 'brand';

const platformOptions: Array<{ value: SocialPlatform; label: string }> = [
  { value: 'douyin', label: '抖音' },
  { value: 'xiaohongshu', label: '小红书' },
  { value: 'wechat', label: '微信公众号' },
  { value: 'other', label: '其他来源' },
];
const loginPlatformOptions: Array<{ value: Platform; label: string; note: string }> = [
  { value: 'douyin', label: '抖音', note: '扫码登录后打开视频或搜索页' },
  { value: 'xiaohongshu', label: '小红书', note: '扫码登录后打开笔记或搜索页' },
  { value: 'wechat', label: '公众号文章页', note: '公开文章一般无需登录；遇到验证时使用' },
];
const loginPlatformLabels: Record<Platform, string> = { douyin: '抖音', xiaohongshu: '小红书', wechat: '微信公众号' };

function extractUrls(text: string) {
  return (text.match(/https?:\/\/[^\s<>"']+/g) ?? []).map((url) => url.replace(/[),，。；;!！?？]+$/, '')).filter(Boolean);
}

function isWechatArticleLink(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname.toLowerCase() === 'mp.weixin.qq.com' && (url.pathname === '/s' || url.pathname.startsWith('/s/'));
  } catch { return false; }
}

export function QuickAddModal() {
  const open = useUiStore((state) => state.quickAddOpen);
  const close = useUiStore((state) => state.closeQuickAdd);
  const projectId = useDesktopState((state) => state.current?.id);
  const [mode, setMode] = useState<Mode>('wechat');
  const [wechatLinks, setWechatLinks] = useState('');
  const [socialPlatform, setSocialPlatform] = useState<SocialPlatform>('douyin');
  const [socialTitle, setSocialTitle] = useState('');
  const [socialText, setSocialText] = useState('');
  const [loginPlatform, setLoginPlatform] = useState<Platform>('douyin');
  const [loginUrl, setLoginUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [tone, setTone] = useState<Tone>('neutral');
  const activeRef = useRef(true);

  useEffect(() => {
    activeRef.current = open;
    if (!open) return;
    setMode('wechat'); setWechatLinks(''); setSocialPlatform('douyin'); setSocialTitle(''); setSocialText(''); setLoginPlatform('douyin'); setLoginUrl(''); setBusy(false); setMessage(''); setTone('neutral');
  }, [open]);
  useEffect(() => () => { activeRef.current = false; }, []);

  async function waitForJob(projectId: string, job: Job): Promise<Job> {
    for (let attempt = 0; attempt < 120; attempt++) {
      await new Promise((resolve) => window.setTimeout(resolve, 500));
      if (!activeRef.current) return job;
      const jobs = await window.guance!.invoke('jobs.list', { projectId });
      const current = jobs.find((item) => item.id === job.id);
      if (!current) return job;
      if (current.status !== 'running') return current;
    }
    throw new Error('读取时间较长，请关闭窗口后到采集任务里查看结果');
  }

  async function submit() {
    if (!projectId || !window.guance) return;
    setMessage(''); setTone('neutral');
    let input: DesktopCommands['collect.start']['input'];
    if (mode === 'wechat') {
      const urls = extractUrls(wechatLinks);
      if (!urls.length) { setTone('warning'); setMessage('没有识别到链接。请在微信里点右上角“··· → 复制链接”，再粘贴到这里。'); return; }
      if (urls.length > 10) { setTone('warning'); setMessage('一次最多读取10篇公众号文章，请分批粘贴。'); return; }
      const invalid = urls.find((url) => !isWechatArticleLink(url));
      if (invalid) { setTone('warning'); setMessage(`这不是公众号文章链接：${invalid}。请只粘贴 mp.weixin.qq.com/s 开头的文章链接。`); return; }
      input = { projectId, kind: 'wechat-article', url: urls[0], urls };
    } else {
      const content = socialText.trim();
      if (content.length < 2) { setTone('warning'); setMessage('请先粘贴抖音/小红书的分享文案或正文。'); return; }
      input = { projectId, kind: 'paste', url: extractUrls(content)[0] ?? '', platform: socialPlatform, title: socialTitle.trim() || undefined, content };
    }
    setBusy(true);
    try {
      await flushDesktop();
      const job = await window.guance.invoke('collect.start', input);
      const finished = await waitForJob(projectId, job);
      if (!activeRef.current) return;
      if (finished.status === 'completed') {
        await refreshProject(projectId).catch(() => undefined);
        setTone('success'); setMessage(finished.result ?? '已保存到市场情报，请继续核实原始来源。');
        if (mode === 'wechat') setWechatLinks(''); else { setSocialTitle(''); setSocialText(''); }
      } else if (finished.status === 'failed') {
        setTone('danger'); setMessage(finished.error ?? '读取失败，请稍后重试。');
      } else {
        setTone('warning'); setMessage(finished.error ?? '任务已结束，请到采集任务里查看结果。');
      }
    } catch (error) {
      if (activeRef.current) { setTone('danger'); setMessage(error instanceof Error ? error.message : '添加失败，请稍后重试'); }
    } finally {
      if (activeRef.current) setBusy(false);
    }
  }

  async function openPlatformLogin() {
    if (!window.guance) return;
    setBusy(true); setMessage(''); setTone('neutral');
    try {
      const url = loginUrl.trim();
      if (url && !/^https:\/\//.test(url)) throw new Error('请填写 https:// 开头的链接');
      await window.guance.platform.open(loginPlatform, url || undefined);
      setTone('success');
      setMessage(`已打开${loginPlatformLabels[loginPlatform]}窗口。请完成登录并打开一篇视频、笔记或文章，然后回到这里点“采集当前页面”。`);
    } catch (error) {
      if (activeRef.current) { setTone('danger'); setMessage(error instanceof Error ? error.message : '登录窗口打开失败'); }
    } finally {
      if (activeRef.current) setBusy(false);
    }
  }

  async function captureLoginPage() {
    if (!projectId || !window.guance) return;
    setBusy(true); setMessage(''); setTone('neutral');
    try {
      await flushDesktop();
      const items = await window.guance.platform.capture(loginPlatform);
      if (!items.length) throw new Error('当前页面没有识别到可保存内容。请先在登录窗口打开一篇视频、笔记或文章，或完成登录后再试。');
      let saved = 0; let failed = 0;
      for (const item of items.slice(0, 20)) {
        try {
          const job = await window.guance.invoke('collect.start', { projectId, kind: 'paste', url: item.url, platform: loginPlatform, title: item.title, content: item.content });
          const finished = await waitForJob(projectId, job);
          if (finished.status === 'completed') saved++; else failed++;
        } catch { failed++; }
      }
      await refreshProject(projectId).catch(() => undefined);
      setTone(saved ? 'success' : 'warning');
      setMessage(`已保存 ${saved} 条${failed ? `，${failed} 条失败` : ''}。请到市场情报核实原始来源。`);
    } catch (error) {
      if (activeRef.current) { setTone('danger'); setMessage(error instanceof Error ? error.message : '采集当前页面失败'); }
    } finally {
      if (activeRef.current) setBusy(false);
    }
  }

  async function clearPlatformLogin() {
    if (!window.guance) return;
    setBusy(true); setMessage(''); setTone('neutral');
    try {
      await window.guance.platform.clear(loginPlatform);
      setTone('success'); setMessage(`已清除${loginPlatformLabels[loginPlatform]}的登录状态。`);
    } catch (error) {
      if (activeRef.current) { setTone('danger'); setMessage(error instanceof Error ? error.message : '清除登录状态失败'); }
    } finally {
      if (activeRef.current) setBusy(false);
    }
  }

  return <Modal open={open} onClose={close} size="lg" title="添加情报" description="推荐直接粘贴；需要登录的页面可用内置登录窗口，手动登录后采集当前页面。"
    footer={<><Button onClick={close}>关闭</Button><Button variant="primary" disabled={busy || !projectId} onClick={() => void (mode === 'login' ? captureLoginPage() : submit())}>{busy ? '处理中…' : mode === 'login' ? '采集当前页面' : mode === 'wechat' ? '读取并添加文章' : '保存为情报'}</Button></>}>
    <div className="space-y-4">
      <InfoBanner tone="brand" title="给业务同事的最简操作">
        公众号文章：复制文章链接即可。抖音 / 小红书：复制分享文案或正文即可。粘贴模式：不用登录、不用填写应用ID或密钥；需要登录时再用“登录窗口采集”。
      </InfoBanner>

      <div className="flex flex-wrap gap-2">
        <Button variant={mode === 'wechat' ? 'primary' : 'secondary'} onClick={() => { setMode('wechat'); setMessage(''); }}>公众号文章链接</Button>
        <Button variant={mode === 'social' ? 'primary' : 'secondary'} onClick={() => { setMode('social'); setMessage(''); }}>抖音 / 小红书文案</Button>
        <Button variant={mode === 'login' ? 'primary' : 'secondary'} onClick={() => { setMode('login'); setMessage(''); }}>登录窗口采集（实验）</Button>
      </div>

      {mode === 'wechat' ? <div className="space-y-4">
        <div className="rounded-xl border border-line bg-[#f8fafc] p-4">
          <p className="text-sm font-semibold text-ink">怎么复制公众号文章链接</p>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-[12px] leading-6 text-muted">
            <li>在微信里打开一篇公众号文章。</li>
            <li>点右上角“···”，选择“复制链接”。</li>
            <li>回到这里粘贴，一行一个，最多10篇。</li>
          </ol>
        </div>
        <Field label="公众号文章链接" htmlFor="quick-wechat-links" hint="只读取公开文章；遇到“环境异常/需要验证”时，请打开文章复制全文，改用“抖音 / 小红书文案”保存。">
          <textarea id="quick-wechat-links" className="input min-h-32" rows={5} placeholder={'https://mp.weixin.qq.com/s/…\nhttps://mp.weixin.qq.com/s/…'} value={wechatLinks} onChange={(event) => setWechatLinks(event.target.value)} />
        </Field>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] text-muted">也可以上传 .txt / .csv 链接列表：</span>
          <input type="file" accept=".txt,.csv,text/plain,text/csv" className="text-[11px]" onChange={(event) => { void (async () => { const file = event.target.files?.[0]; if (!file) return; const urls = extractUrls(await file.text()).filter(isWechatArticleLink); if (!urls.length) { setTone('warning'); setMessage('文件里没有识别到公众号文章链接。'); return; } setWechatLinks(urls.slice(0, 10).join('\n')); setTone('neutral'); setMessage(urls.length > 10 ? `文件里识别到 ${urls.length} 个链接，已填入前 10 个；请分批读取。` : `已从文件识别到 ${urls.length} 个公众号文章链接。`); })(); }} />
        </div>
      </div> : mode === 'social' ? <div className="space-y-4">
        <div className="rounded-xl border border-line bg-[#f8fafc] p-4">
          <p className="text-sm font-semibold text-ink">怎么复制抖音 / 小红书内容</p>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-[12px] leading-6 text-muted">
            <li>在抖音或小红书打开内容，点“分享”。</li>
            <li>选择“复制链接”或“复制文案”。</li>
            <li>回到这里粘贴；正文里包含链接也可以，应用会自动识别。</li>
          </ol>
        </div>
        <Field label="内容来自" htmlFor="quick-social-platform">
          <select id="quick-social-platform" className="input" value={socialPlatform} onChange={(event) => setSocialPlatform(event.target.value as SocialPlatform)}>
            {platformOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
        </Field>
        <Field label="标题（可不填）" htmlFor="quick-social-title" hint="不填时会自动取第一行；如果分享文案很乱，可以在这里写一个清楚的标题。">
          <input id="quick-social-title" className="input" maxLength={2000} placeholder="例如：秋季新品用户反馈" value={socialTitle} onChange={(event) => setSocialTitle(event.target.value)} />
        </Field>
        <Field label="分享文案 / 正文" htmlFor="quick-social-content" hint="建议同时粘贴标题和一段正文，便于后续检索和核实。只保存链接也可以。">
          <textarea id="quick-social-content" className="input min-h-36" rows={7} placeholder="例如：秋季新品用户反馈…… 用户提到质地清爽，希望增加小规格。 https://xhslink.com/…" value={socialText} onChange={(event) => setSocialText(event.target.value)} />
        </Field>
      </div> : <div className="space-y-4">
        <InfoBanner tone="warning" title="实验功能：使用你自己的平台账号">
          点击下方按钮会打开独立的平台登录窗口。请只登录自己的账号；窗口不会读取或上传你的密码，但登录状态会保存在本机独立分区。平台可能要求验证码，账号风控风险由使用者自行承担。
        </InfoBanner>
        <div className="grid gap-2 sm:grid-cols-3">
          {loginPlatformOptions.map((item) => <button key={item.value} type="button" onClick={() => { setLoginPlatform(item.value); setMessage(''); }} className={`rounded-xl border p-3 text-left ${loginPlatform === item.value ? 'border-brand bg-[#f5f8fc]' : 'border-line bg-white'}`}><p className="text-sm font-semibold text-ink">{item.label}</p><p className="mt-1 text-[11px] leading-5 text-muted">{item.note}</p></button>)}
        </div>
        <Field label="可选：先打开一个链接" htmlFor="quick-login-url" hint="不填则打开平台首页。公众号可粘贴文章链接；抖音/小红书可粘贴视频或笔记链接。">
          <input id="quick-login-url" className="input" type="url" placeholder="https://…" value={loginUrl} onChange={(event) => setLoginUrl(event.target.value)} />
        </Field>
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" disabled={busy} onClick={() => void openPlatformLogin()}>打开登录窗口</Button>
          <Button disabled={busy} onClick={() => void clearPlatformLogin()}>清除登录状态</Button>
        </div>
        <div className="rounded-xl border border-line bg-[#f8fafc] p-4">
          <p className="text-sm font-semibold text-ink">操作步骤</p>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-[12px] leading-6 text-muted">
            <li>点“打开登录窗口”，在独立窗口中扫码或登录。</li>
            <li>在窗口里打开一篇视频、笔记或公众号文章；搜索页会保存可见链接。</li>
            <li>回到本窗口，点底部“采集当前页面”。</li>
            <li>采集结果会进入市场情报，标记为待核实。</li>
          </ol>
        </div>
        <p className="text-[11px] leading-5 text-faint">只采集当前页面可见内容，不导出 Cookie，不上传账号密码。抖音/小红书页面改版或要求验证时会提示采集失败。</p>
      </div>}

      {message && <InfoBanner tone={tone}>{message}</InfoBanner>}
      <p className="text-[11px] leading-5 text-faint">保存后会进入“市场情报”，标记为待核实，并保留原文链接（如果识别到）。不会自动发布，也不会自动调用付费模型。</p>
    </div>
  </Modal>;
}
