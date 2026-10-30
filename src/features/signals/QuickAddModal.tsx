import { useEffect, useRef, useState } from 'react';
import type { DesktopCommands, Job } from '@/types/desktop';
import { refreshProject, flushDesktop, useDesktopState } from '@/desktop/client';
import { useUiStore } from '@/store/ui';
import { Modal } from '@/components/ui/Overlay';
import { Button } from '@/components/ui/Button';
import { Field, InfoBanner } from '@/components/ui/Form';

type Mode = 'wechat' | 'social';
type SocialPlatform = 'douyin' | 'xiaohongshu' | 'wechat' | 'other';
type Tone = 'neutral' | 'warning' | 'success' | 'danger' | 'brand';

const platformOptions: Array<{ value: SocialPlatform; label: string }> = [
  { value: 'douyin', label: '抖音' },
  { value: 'xiaohongshu', label: '小红书' },
  { value: 'wechat', label: '微信公众号' },
  { value: 'other', label: '其他来源' },
];

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
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [tone, setTone] = useState<Tone>('neutral');
  const activeRef = useRef(true);

  useEffect(() => {
    activeRef.current = open;
    if (!open) return;
    setMode('wechat'); setWechatLinks(''); setSocialPlatform('douyin'); setSocialTitle(''); setSocialText(''); setBusy(false); setMessage(''); setTone('neutral');
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

  return <Modal open={open} onClose={close} size="lg" title="粘贴添加情报" description="不用登录、不用填写应用ID或密钥；复制链接或文案即可。"
    footer={<><Button onClick={close}>关闭</Button><Button variant="primary" disabled={busy || !projectId} onClick={() => void submit()}>{busy ? '正在读取…' : mode === 'wechat' ? '读取并添加文章' : '保存为情报'}</Button></>}>
    <div className="space-y-4">
      <InfoBanner tone="brand" title="给业务同事的最简操作">
        公众号文章：复制文章链接即可。抖音 / 小红书：复制分享文案或正文即可。应用不会登录你的平台账号，也不会读取密码或 Cookie。
      </InfoBanner>

      <div className="flex flex-wrap gap-2">
        <Button variant={mode === 'wechat' ? 'primary' : 'secondary'} onClick={() => { setMode('wechat'); setMessage(''); }}>公众号文章链接</Button>
        <Button variant={mode === 'social' ? 'primary' : 'secondary'} onClick={() => { setMode('social'); setMessage(''); }}>抖音 / 小红书文案</Button>
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
      </div> : <div className="space-y-4">
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
      </div>}

      {message && <InfoBanner tone={tone}>{message}</InfoBanner>}
      <p className="text-[11px] leading-5 text-faint">保存后会进入“市场情报”，标记为待核实，并保留原文链接（如果识别到）。不会自动发布，也不会自动调用付费模型。</p>
    </div>
  </Modal>;
}
