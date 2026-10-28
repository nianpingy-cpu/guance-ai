// @vitest-environment node
import { it, expect } from 'vitest';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';
import { LocalDatabase } from './database';
import { Jobs } from './jobs';
import { CollectionService, privateIP } from './collect';
it('平台应用编号变更时必须明确填写新密钥，失败保留原配置', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'guance-platform-config-')); const db = new LocalDatabase(dir);
  const service = new CollectionService(db, new Jobs(db), { encrypt: async (s) => 'cipher:' + s, decrypt: async (s) => s.slice(7) });
  try {
    await service.saveConnection({ platform: 'wechat', appId: 'fixture-app-A', secret: 'FAKE_APP_SECRET_A' });
    await expect(service.saveConnection({ platform: 'wechat', appId: 'fixture-app-B' })).rejects.toThrow(/重新.*密钥/);
    expect(service.connections().find(c => c.id === 'wechat')?.appId).toBe('fixture-app-A');
    await service.saveConnection({ platform: 'wechat', appId: 'fixture-app-B', secret: 'FAKE_APP_SECRET_B' });
    expect(service.connections().find(c => c.id === 'wechat')?.appId).toBe('fixture-app-B');
  } finally { db.close(); rmSync(dir, { recursive: true, force: true }); }
});
it('公网IPv6可用，回环/私有/映射地址拒绝', () => { expect(privateIP('2606:4700::1111')).toBe(false); for (const ip of ['::1', 'fc00::1', 'fe80::1', '::ffff:127.0.0.1', '10.0.0.1', '100.64.0.1']) expect(privateIP(ip)).toBe(true); });
it('采集RSS/网页保留来源，重复任务不重复入库；官方未接通拒绝；应用中断保留任务', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'guance-collect-')); const db = new LocalDatabase(dir); const jobs = new Jobs(db); const service = new CollectionService(db, jobs, { encrypt: async (s) => s, decrypt: async (s) => s }, true);
  const server = createServer((req, res) => { if (req.url === '/feed') { res.setHeader('content-type', 'application/rss+xml'); res.end('<rss><channel><item><title>茶饮新需求</title><link>https://example.com/a</link><pubDate>Mon, 26 Oct 2026 00:00:00 GMT</pubDate><description>消费者关注低糖产品</description></item></channel></rss>'); } else res.end('<html><head><title>行业消息</title></head><body><script>secret()</script><article>真实公开网页正文</article></body></html>'); });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r)); const address = server.address(); if (!address || typeof address === 'string') throw new Error('port'); const url = `http://127.0.0.1:${address.port}`;
  try {
    const p = db.create('业务', 'real');
    for (const path of ['/feed', '/feed', '/page']) { const j = service.start({ projectId: p.id, kind: path === '/feed' ? 'rss' : 'web', url: url + path }); for (let i = 0; i < 50 && jobs.list(p.id).find((x) => x.id === j.id)?.status === 'running'; i++) await delay(20); expect(jobs.list(p.id).find((x) => x.id === j.id)?.status).toBe('completed'); }
    const data = db.load(p.id).data; expect(data.signals).toHaveLength(2); expect(data.sources.every((s) => s.url && s.taskId && s.contentHash && !s.simulated)).toBe(true);
    expect(data.signals[1].quote).not.toContain('secret');
    expect(() => service.start({ projectId: p.id, kind: 'douyin', url: 'https://example.com' })).toThrow(/待开通/);
  } finally { server.closeAllConnections(); await new Promise<void>((r) => server.close(() => r())); db.close(); rmSync(dir, { recursive: true, force: true }); }
});

it('Atom混合文本、HTML与XHTML正文保留内容顺序，关联待办只在新增有效情报后完成', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'guance-atom-')); const db = new LocalDatabase(dir); const jobs = new Jobs(db);
  const service = new CollectionService(db, jobs, { encrypt: async (s) => s, decrypt: async (s) => s }, true);
  const entry = (id: string, content: string) => `<entry><id>https://example.com/${id}</id><title>${id}</title><link href="https://example.com/${id}"/><updated>2026-10-28T00:00:00Z</updated>${content}</entry>`;
  const feed = `<feed xmlns="http://www.w3.org/2005/Atom"><id>https://example.com/feed</id><title>审查订阅</title><updated>2026-10-28T00:00:00Z</updated><author><name>Fixture</name></author>${entry('text', '<content type="text">文本正文</content>')}${entry('html', '<content type="html">&lt;p&gt;HTML正文&lt;/p&gt;</content>')}${entry('xhtml', '<content type="xhtml"><div xmlns="http://www.w3.org/1999/xhtml"><p>保留<em>中间强调</em>及后文</p><script>ignoreMe()</script></div></content>')}</feed>`;
  const server = createServer((_req, res) => { res.setHeader('content-type', 'application/atom+xml'); res.end(feed); });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r)); const address = server.address(); if (!address || typeof address === 'string') throw new Error('port');
  try {
    const p = db.create('Atom业务', 'real'); p.data.feedbackTasks.push({ id: 'FT-atom', title: '补充证据', detail: '', trigger: '复盘', createdAt: new Date().toISOString(), status: 'open', linkedSignalIds: [], source: 'review' });
    db.save(p.id, p.revision, p.data);
    const first = service.start({ projectId: p.id, kind: 'rss', url: `http://127.0.0.1:${address.port}`, triggerTaskId: 'FT-atom' });
    for (let i = 0; i < 100 && jobs.list(p.id).find((j) => j.id === first.id)?.status === 'running'; i++) await delay(10);
    expect(jobs.list(p.id).find((j) => j.id === first.id)?.status).toBe('completed');
    const collected = db.load(p.id); expect(collected.data.signals).toHaveLength(3);
    expect(collected.data.sources.map((s) => s.rawContent)).toEqual(['文本正文', 'HTML正文', '保留中间强调及后文']);
    expect(collected.data.feedbackTasks[0].status).toBe('done');
    collected.data.feedbackTasks[0].status = 'open'; db.save(p.id, collected.revision, collected.data);
    const repeated = service.start({ projectId: p.id, kind: 'rss', url: `http://127.0.0.1:${address.port}`, triggerTaskId: 'FT-atom' });
    for (let i = 0; i < 100 && jobs.list(p.id).find((j) => j.id === repeated.id)?.status === 'running'; i++) await delay(10);
    const repeatedJob = jobs.list(p.id).find((j) => j.id === repeated.id);
    expect(repeatedJob?.status).toBe('completed'); expect(repeatedJob?.result).toContain('重复3条');
    expect(repeatedJob?.result).toContain('未新增有效情报'); expect(db.load(p.id).data.feedbackTasks[0].status).toBe('open');
  } finally { server.closeAllConnections(); await new Promise<void>((r) => server.close(() => r())); db.close(); rmSync(dir, { recursive: true, force: true }); }
});

it('无正文的订阅明确报告零有效结果并保留关联待办', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'guance-empty-feed-')); const db = new LocalDatabase(dir); const jobs = new Jobs(db);
  const service = new CollectionService(db, jobs, { encrypt: async (s) => s, decrypt: async (s) => s }, true);
  const server = createServer((_req, res) => { res.setHeader('content-type', 'application/rss+xml'); res.end('<rss><channel><item><title>正文缺失</title><link>https://example.com/missing</link></item></channel></rss>'); });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r)); const address = server.address(); if (!address || typeof address === 'string') throw new Error('port');
  try {
    const p = db.create('零结果业务', 'real'); p.data.feedbackTasks.push({ id: 'FT-empty', title: '仍需补充证据', detail: '', trigger: '复盘', createdAt: new Date().toISOString(), status: 'open', linkedSignalIds: [], source: 'review' }); db.save(p.id, p.revision, p.data);
    const job = service.start({ projectId: p.id, kind: 'rss', url: `http://127.0.0.1:${address.port}`, triggerTaskId: 'FT-empty' });
    for (let i = 0; i < 100 && jobs.list(p.id).find((j) => j.id === job.id)?.status === 'running'; i++) await delay(10);
    const finished = jobs.list(p.id).find((j) => j.id === job.id); expect(finished?.status).toBe('completed');
    expect(finished?.result).toContain('缺少标题/正文1条'); expect(finished?.result).toContain('未新增有效情报');
    const saved = db.load(p.id); expect(saved.data.signals).toHaveLength(0); expect(saved.data.feedbackTasks[0].status).toBe('open');
  } finally { server.closeAllConnections(); await new Promise<void>((r) => server.close(() => r())); db.close(); rmSync(dir, { recursive: true, force: true }); }
});

it.each(['script', 'style', 'nav', 'footer', 'iframe', 'noscript'])('Atom前缀XHTML只有%s节点时不新增证据或完成待办', async (tag) => {
  const dir = mkdtempSync(join(tmpdir(), 'guance-prefixed-empty-')); const db = new LocalDatabase(dir); const jobs = new Jobs(db);
  const service = new CollectionService(db, jobs, { encrypt: async (s) => s, decrypt: async (s) => s }, true);
  const feed = `<feed xmlns="http://www.w3.org/2005/Atom"><id>https://example.com/feed</id><title>前缀正文清洗</title><updated>2026-10-28T00:00:00Z</updated><author><name>Fixture</name></author><entry><id>https://example.com/${tag}</id><title>仅非正文节点</title><link href="https://example.com/${tag}"/><updated>2026-10-28T00:00:00Z</updated><content type="xhtml"><xh:div xmlns:xh="http://www.w3.org/1999/xhtml"><xh:${tag}>SHOULD_NOT_BE_EVIDENCE()</xh:${tag}></xh:div></content></entry></feed>`;
  const server = createServer((_req, res) => { res.setHeader('content-type', 'application/atom+xml'); res.end(feed); });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r)); const address = server.address(); if (!address || typeof address === 'string') throw new Error('port');
  try {
    const p = db.create('前缀零正文', 'real'); p.data.feedbackTasks.push({ id: 'FT-prefix', title: '待补证据', detail: '', trigger: '复盘', createdAt: new Date().toISOString(), status: 'open', linkedSignalIds: [], source: 'review' });
    const before = db.save(p.id, p.revision, p.data);
    const job = service.start({ projectId: p.id, kind: 'rss', url: `http://127.0.0.1:${address.port}`, triggerTaskId: 'FT-prefix' });
    for (let i = 0; i < 100 && jobs.list(p.id).find((j) => j.id === job.id)?.status === 'running'; i++) await delay(10);
    const finished = jobs.list(p.id).find((j) => j.id === job.id); expect(finished?.status).toBe('completed');
    const saved = db.load(p.id); expect(saved.data.signals).toHaveLength(0); expect(saved.data.sources).toHaveLength(0);
    expect(saved.data.feedbackTasks[0].status).toBe('open'); expect(saved.revision).toBe(before.revision);
    expect(finished?.result).toContain('新增0条'); expect(finished?.result).toContain('缺少标题/正文1条');
  } finally { server.closeAllConnections(); await new Promise<void>((r) => server.close(() => r())); db.close(); rmSync(dir, { recursive: true, force: true }); }
});

it('Atom前缀XHTML清洗非正文节点并保留文章内联顺序与实体', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'guance-prefixed-body-')); const db = new LocalDatabase(dir); const jobs = new Jobs(db);
  const service = new CollectionService(db, jobs, { encrypt: async (s) => s, decrypt: async (s) => s }, true);
  const feed = '<feed xmlns="http://www.w3.org/2005/Atom"><id>https://example.com/feed</id><title>前缀正文</title><updated>2026-10-28T00:00:00Z</updated><author><name>Fixture</name></author><entry><id>https://example.com/body</id><title>文章与脚本</title><link href="https://example.com/body"/><updated>2026-10-28T00:00:00Z</updated><content type="xhtml"><h:div xmlns:h="http://www.w3.org/1999/xhtml"><h:script>scriptMarker()</h:script><h:style>styleMarker{}</h:style>前<h:em>中&amp;&#x4E2D;</h:em><h:iframe>iframeMarker</h:iframe>后<h:nav>navMarker</h:nav><h:footer>footerMarker</h:footer><h:noscript>noscriptMarker</h:noscript></h:div></content></entry></feed>';
  const server = createServer((_req, res) => { res.setHeader('content-type', 'application/atom+xml'); res.end(feed); });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r)); const address = server.address(); if (!address || typeof address === 'string') throw new Error('port');
  try {
    const p = db.create('前缀文章', 'real');
    const job = service.start({ projectId: p.id, kind: 'rss', url: `http://127.0.0.1:${address.port}` });
    for (let i = 0; i < 100 && jobs.list(p.id).find((j) => j.id === job.id)?.status === 'running'; i++) await delay(10);
    expect(jobs.list(p.id).find((j) => j.id === job.id)?.status).toBe('completed');
    const saved = db.load(p.id); expect(saved.data.signals).toHaveLength(1);
    expect(saved.data.sources[0].rawContent).toBe('前中&中后'); expect(saved.data.signals[0].quote).toBe('前中&中后');
  } finally { server.closeAllConnections(); await new Promise<void>((r) => server.close(() => r())); db.close(); rmSync(dir, { recursive: true, force: true }); }
});

async function collectAtomFixture(raw: string) {
  const dir = mkdtempSync(join(tmpdir(), 'guance-atom-standard-')); const db = new LocalDatabase(dir); const jobs = new Jobs(db);
  const service = new CollectionService(db, jobs, { encrypt: async s => s, decrypt: async s => s }, true);
  const server = createServer((_req, res) => { res.setHeader('content-type', 'application/atom+xml'); res.end(raw); });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve)); const address = server.address(); if (!address || typeof address === 'string') throw new Error('port');
  try {
    const p = db.create('Atom标准输入', 'real'); const job = service.start({ projectId: p.id, kind: 'rss', url: `http://127.0.0.1:${address.port}/feed.xml` });
    for (let i = 0; i < 100 && jobs.list(p.id).find(j => j.id === job.id)?.status === 'running'; i++) await delay(10);
    return { job: jobs.list(p.id).find(j => j.id === job.id), data: db.load(p.id).data };
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); db.close(); rmSync(dir, { recursive: true, force: true }); }
}

it.each([
  { type: 'text', markup: '茶&lt;例&gt; &amp; 茶', expected: '茶<例> & 茶' },
  { type: 'html', markup: '&lt;b&gt;茶&lt;/b&gt; &amp;amp; 香', expected: '茶 & 香' },
  { type: 'xhtml', markup: '<h:div xmlns:h="http://www.w3.org/1999/xhtml">茶<h:em>叶</h:em>礼</h:div>', expected: '茶叶礼' },
])('Atom $type 标题正确提取文本及实体，不丢弃有效条目', async ({ type, markup, expected }) => {
  const raw = `<feed xmlns="http://www.w3.org/2005/Atom"><id>https://example.com/feed</id><title>标准标题</title><updated>2026-10-29T00:00:00Z</updated><author><name>Fixture</name></author><entry><id>https://example.com/item</id><title type="${type}">${markup}</title><updated>2026-10-29T00:00:00Z</updated><link href="https://example.com/item"/><content type="text">有效正文</content></entry></feed>`;
  const { job, data } = await collectAtomFixture(raw);
  expect(job?.status).toBe('completed'); expect(data.signals).toHaveLength(1);
  expect(data.signals[0].title).toBe(expected); expect(data.sources[0].name).toBe(expected);
  expect(data.sources[0].rawContent).toBe('有效正文'); expect(data.sources[0].url).toBe('https://example.com/item');
});

it('Atom feed与entry可使用不同合法前缀，只读取Atom命名空间字段', async () => {
  const raw = '<a:feed xmlns:a="http://www.w3.org/2005/Atom" xmlns:f="urn:unrelated"><a:id>https://example.com/feed</a:id><a:title>前缀</a:title><a:updated>2026-10-29T00:00:00Z</a:updated><a:author><a:name>Fixture</a:name></a:author><f:entry><f:title>不可作为Atom条目</f:title><f:link href="https://example.com/foreign"/><f:content>外部扩展</f:content></f:entry><b:entry xmlns:b="http://www.w3.org/2005/Atom"><b:id>https://example.com/item</b:id><f:title>不可作为Atom标题</f:title><b:title type="xhtml"><h:div xmlns:h="http://www.w3.org/1999/xhtml">前缀<h:em>标题</h:em></h:div></b:title><b:updated>2026-10-29T00:00:00Z</b:updated><b:link href="https://example.com/item"/><b:content type="xhtml"><h:div xmlns:h="http://www.w3.org/1999/xhtml">前<h:em>缀</h:em>正文<h:script>excluded()</h:script></h:div></b:content></b:entry></a:feed>';
  const { job, data } = await collectAtomFixture(raw);
  expect(job?.status).toBe('completed'); expect(data.signals).toHaveLength(1);
  expect(data.signals[0].title).toBe('前缀标题'); expect(data.sources[0].rawContent).toBe('前缀正文');
  expect(data.sources[0].url).toBe('https://example.com/item'); expect(data.sources[0].publishedAt).toBe('2026-10-29T00:00:00.000Z');
});

it('Atom相对原始链接按feed、entry和link的xml:base依次解析', async () => {
  const raw = '<feed xmlns="http://www.w3.org/2005/Atom" xml:base="https://example.com/catalog/"><id>https://example.com/feed</id><title>相对链接</title><updated>2026-10-29T00:00:00Z</updated><author><name>Fixture</name></author><entry xml:base="../articles/"><id>https://example.com/item</id><title>原始链接</title><updated>2026-10-29T00:00:00Z</updated><link xml:base="2026/" href="tea.html"/><content>有效正文</content></entry></feed>';
  const { job, data } = await collectAtomFixture(raw);
  expect(job?.status).toBe('completed'); expect(data.signals).toHaveLength(1);
  expect(data.sources[0].url).toBe('https://example.com/articles/2026/tea.html');
});
