import { createHash, randomUUID } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { load } from 'cheerio';
import { XMLParser } from 'fast-xml-parser';
import { z } from 'zod';
import type { Signal, Source } from '../src/types/domain';
import { LocalDatabase } from './database';
import { Jobs } from './jobs';
import type { Vault } from './models';
import { checkedFetch } from './network';
export const collectionSchema = z.object({ projectId: z.string().min(1), kind: z.enum(['web', 'rss', 'wechat', 'xiaohongshu', 'douyin']), url: z.string().max(2000), triggerTaskId: z.string().optional() }).strict();
type Request = z.infer<typeof collectionSchema>;
export const platformSchema = z.object({ platform: z.enum(['wechat', 'xiaohongshu', 'douyin']), appId: z.string().trim().min(1).max(200), secret: z.string().max(16000).optional() }).strict();
export const capabilities = [
  { id: 'wechat', name: '微信公众号', status: '待开通', link: 'https://developers.weixin.qq.com/doc/offiaccount/Getting_Started/Overview.html', description: '官方自有账号内容接口需要应用权限；不提供全网公众号链接抓取或关键词搜索。待完成获批权限与适配器验权后启用。' },
  { id: 'xiaohongshu', name: '小红书', status: '待开通', link: 'https://open.xiaohongshu.com/document/api', description: '需明确获批应用的官方能力与数据授权范围；当前未验证笔记链接查询或关键词搜索权限，不能启动任务。' },
  { id: 'douyin', name: '抖音', status: '待开通', link: 'https://open.douyin.com/platform/resource/docs/ability/search-management/video/', description: 'video.search需单独申请，仅限与自身业务相关的获批关键词，不能查通用品类或竞品词；仅最近1天。当前适配器与授权未验收，链接查询未启用。' },
];
function text(html: string) { const $ = load(html); $('script,style,nav,footer,iframe,noscript').remove(); return $.text().replace(/\s+/g, ' ').trim(); }
function privateIP(ip: string) { return /^(127\.|10\.|192\.168\.|169\.254\.|0\.|172\.(1[6-9]|2\d|3[01])\.|224\.|255\.)/.test(ip) || ip.includes(':'); }
async function publicURL(value: string, testing: boolean): Promise<URL> {
  const u = new URL(value); if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password) throw new Error('采集仅支持无凭据的公开HTTP/HTTPS地址');
  if (['mp.weixin.qq.com', 'xiaohongshu.com', 'xhslink.com', 'douyin.com', 'iesdouyin.com'].some((host) => u.hostname === host || u.hostname.endsWith('.' + host))) throw new Error('该平台仅使用官方授权接口，当前待开通');
  if (!testing) { const addresses = isIP(u.hostname) ? [{ address: u.hostname }] : await lookup(u.hostname, { all: true }); if (!addresses.length || addresses.some((a) => privateIP(a.address))) throw new Error('不能采集本机或私有网络地址'); }
  return u;
}
const feedSchema = z.object({ rss: z.object({ channel: z.object({ item: z.array(z.record(z.string(), z.unknown())).optional() }) }).optional(), feed: z.object({ entry: z.array(z.record(z.string(), z.unknown())).optional() }).optional() });
function scalar(v: unknown): string { if (typeof v === 'string' || typeof v === 'number') return String(v); if (v && typeof v === 'object' && '#text' in v) return scalar(v['#text']); return ''; }
export class CollectionService {
  constructor(private db: LocalDatabase, private jobs: Jobs, private vault: Vault, private testing = false) {}
  connections() { const saved = this.db.setting<Array<{ platform: string; appId: string; cipher: string }>>('platforms', []); return capabilities.map((c) => ({ ...c, appId: saved.find((s) => s.platform === c.id)?.appId ?? '', hasSecret: Boolean(saved.find((s) => s.platform === c.id)?.cipher) })); }
  async saveConnection(value: unknown) { const input = platformSchema.parse(value); const all = this.db.setting<Array<{ platform: string; appId: string; cipher: string }>>('platforms', []); const old = all.find((c) => c.platform === input.platform); const cipher = input.secret ? await this.vault.encrypt(input.secret) : old?.cipher; if (!cipher) throw new Error('请填写应用密钥'); this.db.setSetting('platforms', [...all.filter((c) => c.platform !== input.platform), { platform: input.platform, appId: input.appId, cipher }]); }
  removeConnection(platform: string) { this.db.setSetting('platforms', this.db.setting<Array<{ platform: string }>>('platforms', []).filter((c) => c.platform !== platform)); }
  retry(id: string) { const input = this.db.setting<unknown>('collect:' + id, null); if (!input) throw new Error('任务参数不存在，请新建采集任务'); return this.start(collectionSchema.parse(input)); }
  start(value: Request) {
    const input = collectionSchema.parse(value); if (input.kind !== 'web' && input.kind !== 'rss') throw new Error('官方平台待开通，不能启动对应采集任务');
    const initial = this.db.load(input.projectId); if (input.triggerTaskId && !initial.data.feedbackTasks.some((t) => t.id === input.triggerTaskId)) throw new Error('复盘来源任务不存在');
    const job = this.jobs.start(input.projectId, 'collect', async (signal, progress, taskId) => {
      progress('正在核对来源地址'); const url = await publicURL(input.url, this.testing);
      progress('正在读取公开内容；不绕过登录或平台权限');
      const response = await checkedFetch(url, { signal: AbortSignal.any([signal, AbortSignal.timeout(30000)]), headers: { 'user-agent': 'GuanceAI/0.6 (user-requested research)' } }, 5_000_000);
      const raw = await response.text(); if (signal.aborted) throw new Error('已取消');
      const records: Array<{ title: string; body: string; url: string; published: string }> = [];
      if (input.kind === 'rss') {
        if (/<!DOCTYPE|<!ENTITY/i.test(raw)) throw new Error('不接受含DTD或外部实体的订阅源');
        const parsed = feedSchema.parse(new XMLParser({ ignoreAttributes: false, isArray: (name) => ['item', 'entry', 'link'].includes(name), processEntities: false }).parse(raw));
        const items = parsed.rss?.channel.item ?? parsed.feed?.entry;
        if (!items) throw new Error('未发现RSS/Atom条目');
        for (const item of items.slice(0, 100)) {
          const links = Array.isArray(item.link) ? item.link : [item.link]; const link = links.find((v) => typeof v === 'object' && v && (!('@_rel' in v) || v['@_rel'] === 'alternate')) ?? links[0];
          const target = typeof link === 'object' && link && '@_href' in link ? scalar(link['@_href']) : scalar(link);
          if (!target) continue; const article = new URL(target, url); if (!['https:', 'http:'].includes(article.protocol)) continue;
          records.push({ title: scalar(item.title), body: text(scalar(item['content:encoded'] ?? item.content ?? item.description ?? item.summary)), url: article.href, published: scalar(item.pubDate ?? item.published ?? item.updated) });
        }
      } else {
        const $ = load(raw); const title = $('title').first().text().trim() || $('h1').first().text().trim();
        const published = $('meta[property="article:published_time"]').attr('content') ?? $('time[datetime]').first().attr('datetime') ?? '';
        records.push({ title, body: text($('article').first().html() ?? $('main').first().html() ?? $('body').html() ?? raw), url: url.href, published });
      }
      progress('正在校验与去重'); const current = this.db.load(input.projectId); const data = structuredClone(current.data); let added = 0;
      const hashes = new Set(data.sources.map((s) => s.contentHash));
      for (const row of records) {
        if (!row.title || !row.body) continue;
        const hash = createHash('sha256').update(row.body.replace(/\s+/g, ' ').trim()).digest('hex'); if (hashes.has(hash)) continue; hashes.add(hash);
        const id = randomUUID(); const date = new Date().toISOString(); const publishedAt = Number.isFinite(Date.parse(row.published)) ? new Date(row.published).toISOString() : '';
        const source: Source = { id: `SRC-${id}`, name: row.title.slice(0, 200), platform: input.kind === 'rss' ? 'RSS' : '公开网页', kind: 'industry', publishedAt, url: row.url, collectedAt: date, taskId, contentHash: hash, simulated: false, origin: input.kind === 'rss' ? 'rss' : 'public-web', rawContent: row.body.slice(0, 200000), note: `用户主动采集；${publishedAt ? '发布时间来自原文' : '原文未提供发布时间'}；${row.body.length > 200000 ? '正文超过20万字，已截断；' : ''}${input.triggerTaskId ? `触发于复盘任务 ${input.triggerTaskId}` : '待人工核实'}` };
        const record: Signal = { id: `S-${id}`, title: row.title.slice(0, 2000), summary: row.body.slice(0, 500), quote: row.body.slice(0, 4000), sourceId: source.id, platform: source.platform, category: 'industry', priority: 'medium', status: 'pending', relevance: 3, impact: '尚未分析，请核实原始来源后再用于策略', tags: [], capturedAt: date, note: '' };
        data.sources.push(source); data.signals.push(record); added++;
      }
      if (signal.aborted) throw new Error('已取消');
      if (input.triggerTaskId) data.feedbackTasks = data.feedbackTasks.map((t) => t.id === input.triggerTaskId ? { ...t, status: 'done' as const } : t);
      this.db.save(current.id, current.revision, data); return `读取${records.length}条，新增${added}条；其余重复或缺少标题/正文。每次最多处理100条订阅内容。`;
    });
    this.db.setSetting('collect:' + job.id, input); return job;
  }
}
