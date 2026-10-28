import { createHash, randomUUID } from 'node:crypto';
import { load } from 'cheerio';
import { XMLParser } from 'fast-xml-parser';
import { z } from 'zod';
import type { Signal, Source } from '../src/types/domain';
import { LocalDatabase } from './database';
import { Jobs } from './jobs';
import type { Vault } from './models';
import { checkedFetch } from './network';
import { checkedPublicFetch } from './public-network';
export { isNonPublicAddress as privateIP } from './public-network';
export const collectionSchema = z.object({ projectId: z.string().min(1), kind: z.enum(['web', 'rss', 'wechat', 'xiaohongshu', 'douyin']), url: z.string().max(2000), triggerTaskId: z.string().optional() }).strict();
type Request = z.infer<typeof collectionSchema>;
export const platformSchema = z.object({ platform: z.enum(['wechat', 'xiaohongshu', 'douyin']), appId: z.string().trim().min(1).max(200), secret: z.string().max(16000).optional() }).strict();
export const capabilities = [
  { id: 'wechat', name: '微信公众号', status: '待开通', link: 'https://developers.weixin.qq.com/doc/offiaccount/Getting_Started/Overview.html', description: '官方自有账号内容接口需要应用权限；不提供全网公众号链接抓取或关键词搜索。待完成获批权限与适配器验权后启用。' },
  { id: 'xiaohongshu', name: '小红书', status: '待开通', link: 'https://open.xiaohongshu.com/document/api', description: '需明确获批应用的官方能力与数据授权范围；当前未验证笔记链接查询或关键词搜索权限，不能启动任务。' },
  { id: 'douyin', name: '抖音', status: '待开通', link: 'https://open.douyin.com/platform/resource/docs/ability/search-management/video/', description: 'video.search需单独申请，仅限与自身业务相关的获批关键词，不能查通用品类或竞品词；仅最近1天。当前适配器与授权未验收，链接查询未启用。' },
];
function text(html: string) {
  const $ = load(html);
  const excluded = new Set(['script', 'style', 'nav', 'footer', 'iframe', 'noscript']);
  // XHTML may use any namespace prefix; only the local tag name identifies non-content nodes.
  $('*').filter((_, node) => 'tagName' in node && excluded.has(node.tagName.split(':').at(-1)?.toLowerCase() ?? '')).remove();
  return $.text().replace(/\s+/g, ' ').trim();
}
export function validateCollectionURL(value: string): URL {
  const u = new URL(value); if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password) throw new Error('采集仅支持无凭据的公开HTTP/HTTPS地址');
  const hostname = u.hostname.toLowerCase().replace(/\.$/, '');
  if (['mp.weixin.qq.com', 'xiaohongshu.com', 'xhslink.com', 'douyin.com', 'iesdouyin.com'].some((host) => hostname === host || hostname.endsWith('.' + host))) throw new Error('该平台仅使用官方授权接口，当前待开通');
  return u;
}
const feedSchema = z.object({ rss: z.object({ channel: z.object({ item: z.array(z.record(z.string(), z.unknown())).optional() }) }).optional(), feed: z.object({ entry: z.array(z.record(z.string(), z.unknown())).optional() }).optional() });
function scalar(v: unknown): string { if (typeof v === 'string' || typeof v === 'number') return String(v); if (v && typeof v === 'object' && '#text' in v) return scalar(v['#text']); return ''; }
function atomRecords($: ReturnType<typeof load>, documentURL: URL) {
  const root = $.root().children().first();
  type XmlElement = (typeof root)[number];
  const namespace = (node: XmlElement) => {
    const prefix = node.name.includes(':') ? node.name.split(':')[0] : '';
    const attribute = prefix ? `xmlns:${prefix}` : 'xmlns';
    for (const ancestor of [node, ...$(node).parents().toArray()]) {
      const value = $(ancestor).attr(attribute); if (value !== undefined) return value;
    }
    return '';
  };
  const isAtom = (node: XmlElement, name: string) => node.name.split(':').at(-1) === name && namespace(node) === 'http://www.w3.org/2005/Atom';
  if (!root.length || !isAtom(root[0], 'feed')) return undefined;
  const field = (node: typeof root, name: string) => node.children().filter((_, child) => isAtom(child, name));
  const value = (node: typeof root) => {
    const type = node.attr('type') ?? 'text';
    if (type === 'xhtml') return text(node.html() ?? '');
    if (type === 'html') return text(node.text());
    return node.text().replace(/\s+/g, ' ').trim();
  };
  const records: Array<{ title: string; body: string; url: string; published: string }> = [];
  for (const element of field(root, 'entry').slice(0, 100).toArray()) {
    const entry = $(element); const links = field(entry, 'link');
    const alternate = links.filter((_, link) => !$(link).attr('rel') || $(link).attr('rel') === 'alternate').first();
    const link = alternate.length ? alternate : links.first(); const href = link.attr('href'); if (!href) continue;
    let base = documentURL.href;
    for (const ancestor of [...link.parents().toArray().reverse(), link[0]]) {
      const inherited = $(ancestor).attr('xml:base'); if (inherited !== undefined) base = new URL(inherited, base).href;
    }
    const article = new URL(href, base); if (!['https:', 'http:'].includes(article.protocol)) continue;
    const body = value(field(entry, 'content').first()) || value(field(entry, 'summary').first());
    records.push({ title: value(field(entry, 'title').first()), body, url: article.href, published: field(entry, 'published').first().text().trim() || field(entry, 'updated').first().text().trim() });
  }
  return records;
}
export class CollectionService {
  constructor(private db: LocalDatabase, private jobs: Jobs, private vault: Vault, private testing = false) {}
  connections() { const saved = this.db.setting<Array<{ platform: string; appId: string; cipher: string }>>('platforms', []); return capabilities.map((c) => ({ ...c, appId: saved.find((s) => s.platform === c.id)?.appId ?? '', hasSecret: Boolean(saved.find((s) => s.platform === c.id)?.cipher) })); }
  async saveConnection(value: unknown) {
    const input = platformSchema.parse(value);
    const all = this.db.setting<Array<{ platform: string; appId: string; cipher: string }>>('platforms', []);
    const old = all.find((c) => c.platform === input.platform);
    if (old && old.appId !== input.appId && !input.secret) throw new Error('平台应用编号已改变，请重新填写该应用的密钥');
    const cipher = input.secret ? await this.vault.encrypt(input.secret) : old?.cipher;
    if (!cipher) throw new Error('请填写应用密钥');
    this.db.setSetting('platforms', [...all.filter((c) => c.platform !== input.platform), { platform: input.platform, appId: input.appId, cipher }]);
  }
  removeConnection(platform: string) { this.db.setSetting('platforms', this.db.setting<Array<{ platform: string }>>('platforms', []).filter((c) => c.platform !== platform)); }
  retry(id: string) { const input = this.db.setting<unknown>('collect:' + id, null); if (!input) throw new Error('任务参数不存在，请新建采集任务'); return this.start(collectionSchema.parse(input)); }
  start(value: Request) {
    const input = collectionSchema.parse(value); if (input.kind !== 'web' && input.kind !== 'rss') throw new Error('官方平台待开通，不能启动对应采集任务');
    const initial = this.db.load(input.projectId); if (input.triggerTaskId && !initial.data.feedbackTasks.some((t) => t.id === input.triggerTaskId)) throw new Error('复盘来源任务不存在');
    const job = this.jobs.start(input.projectId, 'collect', async (signal, progress, taskId) => {
      progress('正在核对来源地址'); const url = validateCollectionURL(input.url);
      progress('正在读取公开内容；不绕过登录或平台权限');
      const options = { signal: AbortSignal.any([signal, AbortSignal.timeout(30000)]), headers: { 'user-agent': 'GuanceAI/0.6 (user-requested research)' } };
      const response = await (this.testing ? checkedFetch(url, options, 5_000_000) : checkedPublicFetch(url, options, 5_000_000));
      const raw = await response.text(); if (signal.aborted) throw new Error('已取消');
      const records: Array<{ title: string; body: string; url: string; published: string }> = [];
      if (input.kind === 'rss') {
        if (/<!DOCTYPE|<!ENTITY/i.test(raw)) throw new Error('不接受含DTD或外部实体的订阅源');
        const markup = load(raw, { xmlMode: true }); const atom = atomRecords(markup, url);
        if (atom) records.push(...atom);
        else {
        const parsed = feedSchema.parse(new XMLParser({ ignoreAttributes: false, isArray: (name) => ['item', 'entry', 'link'].includes(name), processEntities: false }).parse(raw));
        const items = parsed.rss?.channel.item ?? parsed.feed?.entry;
        if (!items) throw new Error('未发现RSS/Atom条目');
        const markupItems = markup('rss > channel > item, feed > entry');
        for (const [index, item] of items.slice(0, 100).entries()) {
          const links = Array.isArray(item.link) ? item.link : [item.link]; const link = links.find((v) => typeof v === 'object' && v && (!('@_rel' in v) || v['@_rel'] === 'alternate')) ?? links[0];
          const target = typeof link === 'object' && link && '@_href' in link ? scalar(link['@_href']) : scalar(link);
          if (!target) continue; const article = new URL(target, url); if (!['https:', 'http:'].includes(article.protocol)) continue;
          let body = '';
          for (const field of ['content:encoded', 'content', 'description', 'summary']) {
            const value = item[field];
            if (value == null) continue;
            const node = markupItems.eq(index).children().filter((_, node) => node.name === field).first();
            const contentType = typeof value === 'object' && '@_type' in value ? value['@_type'] : '';
            // Read XHTML from the ordered XML tree so mixed inline text keeps its original order.
            if (contentType === 'xhtml') body = text(node.html() ?? '');
            else if (contentType === 'html') body = text(node.text());
            else if (contentType === 'text') body = node.text().replace(/\s+/g, ' ').trim();
            else body = text(scalar(value));
            if (body) break;
          }
          records.push({ title: scalar(item.title), body, url: article.href, published: scalar(item.pubDate ?? item.published ?? item.updated) });
        }
        }
      } else {
        const $ = load(raw); const title = $('title').first().text().trim() || $('h1').first().text().trim();
        const published = $('meta[property="article:published_time"]').attr('content') ?? $('time[datetime]').first().attr('datetime') ?? '';
        records.push({ title, body: text($('article').first().html() ?? $('main').first().html() ?? $('body').html() ?? raw), url: url.href, published });
      }
      progress('正在校验与去重'); const current = this.db.load(input.projectId); const data = structuredClone(current.data); let added = 0; let duplicates = 0; let missing = 0;
      const hashes = new Set(data.sources.map((s) => s.contentHash));
      for (const row of records) {
        if (!row.title || !row.body) { missing++; continue; }
        const hash = createHash('sha256').update(row.body.replace(/\s+/g, ' ').trim()).digest('hex'); if (hashes.has(hash)) { duplicates++; continue; } hashes.add(hash);
        const id = randomUUID(); const date = new Date().toISOString(); const publishedAt = Number.isFinite(Date.parse(row.published)) ? new Date(row.published).toISOString() : '';
        const source: Source = { id: `SRC-${id}`, name: row.title.slice(0, 200), platform: input.kind === 'rss' ? 'RSS' : '公开网页', kind: 'industry', publishedAt, url: row.url, collectedAt: date, taskId, contentHash: hash, simulated: false, origin: input.kind === 'rss' ? 'rss' : 'public-web', rawContent: row.body.slice(0, 200000), note: `用户主动采集；${publishedAt ? '发布时间来自原文' : '原文未提供发布时间'}；${row.body.length > 200000 ? '正文超过20万字，已截断；' : ''}${input.triggerTaskId ? `触发于复盘任务 ${input.triggerTaskId}` : '待人工核实'}` };
        const record: Signal = { id: `S-${id}`, title: row.title.slice(0, 2000), summary: row.body.slice(0, 500), quote: row.body.slice(0, 4000), sourceId: source.id, platform: source.platform, category: 'industry', priority: 'medium', status: 'pending', relevance: 3, impact: '尚未分析，请核实原始来源后再用于策略', tags: [], capturedAt: date, note: '' };
        data.sources.push(source); data.signals.push(record); added++;
      }
      if (signal.aborted) throw new Error('已取消');
      if (input.triggerTaskId && added > 0) data.feedbackTasks = data.feedbackTasks.map((t) => t.id === input.triggerTaskId ? { ...t, status: 'done' as const } : t);
      this.db.save(current.id, current.revision, data);
      return `读取${records.length}条，新增${added}条；重复${duplicates}条，缺少标题/正文${missing}条。${added === 0 ? `未新增有效情报${input.triggerTaskId ? '，关联复盘任务保留待办' : ''}。` : ''}每次最多处理100条订阅内容。`;
    });
    this.db.setSetting('collect:' + job.id, input); return job;
  }
}
