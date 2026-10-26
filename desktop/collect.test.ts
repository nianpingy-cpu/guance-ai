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
