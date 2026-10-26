// @vitest-environment node
import { it, expect } from 'vitest';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LocalDatabase } from './database';
import { SyncService } from './sync';
import { encrypt, decrypt } from './sync';
import { randomBytes } from 'node:crypto';
it('密文被篡改或放到另一个变更编号下，认证校验拒绝', () => { const key = randomBytes(32); const value = encrypt({ a: 'business' }, key, 'op:1'); expect(decrypt(value, key, 'op:1')).toEqual({ a: 'business' }); expect(() => decrypt(value, key, 'op:2')).toThrow(/密文/); expect(() => decrypt({ ...value, tag: randomBytes(16).toString('base64') }, key, 'op:1')).toThrow(/密文/); });
it('两个独立SQLite实例通过WebDAV加密同步、重复同步幂等、并发保留冲突、错误口令拒绝', async () => {
  const files = new Map<string, string>(); let online = true;
  const server = createServer(async (req, res) => {
    if (!online) { res.writeHead(503); res.end(); return; }
    if (req.headers.authorization !== 'Basic dXNlcjpwYXNz') { res.writeHead(401); res.end(); return; }
    const path = req.url!;
    if (req.method === 'MKCOL') { res.writeHead(201); res.end(); }
    else if (req.method === 'PROPFIND') { res.writeHead(207, { 'content-type': 'application/xml' }); res.end(`<d:multistatus xmlns:d="DAV:">${[...files.keys()].map((p) => `<d:response><d:href>${p}</d:href></d:response>`).join('')}</d:multistatus>`); }
    else if (req.method === 'PUT') { if (files.has(path) && req.headers['if-none-match'] === '*') { res.writeHead(412); res.end(); return; } let body = ''; for await (const c of req) body += c; files.set(path, body); res.writeHead(201); res.end(); }
    else if (files.has(path)) res.end(files.get(path)); else { res.writeHead(404); res.end(); }
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r)); const addr = server.address(); if (!addr || typeof addr === 'string') throw new Error('port');
  const dirs = [mkdtempSync(join(tmpdir(), 'guance-syncA-')), mkdtempSync(join(tmpdir(), 'guance-syncB-'))];
  const [a, b] = dirs.map((d) => new LocalDatabase(d)); const vault = { encrypt: async (s: string) => 'enc:' + s, decrypt: async (s: string) => s.slice(4) };
  const sa = new SyncService(a, vault); const sb = new SyncService(b, vault); const config = { url: `http://127.0.0.1:${addr.port}`, username: 'user', password: 'pass', passphrase: 'long fixture passphrase', automatic: false };
  try {
    await sa.configure(config); await sb.configure(config); const p = a.create('真实项目', 'real');
    await sa.run(); await sb.run(); expect(b.load(p.id).revision).toBe(a.load(p.id).revision); expect(b.list()).toHaveLength(1);
    await sb.run(); expect(b.list()).toHaveLength(1); expect([...files.values()].join('')).not.toContain('真实项目'); expect([...files.values()].join('')).not.toContain('enc:');
    const pa = a.load(p.id); pa.data.company.budgetCents = 234500; a.save(pa.id, pa.revision, pa.data);
    const pb = b.load(p.id); pb.data.company.budgetCents = 678900; b.save(pb.id, pb.revision, pb.data);
    await sa.run(); await sb.run(); await sa.run(); expect(sa.status().conflicts).toHaveLength(1); expect(sb.status().conflicts).toHaveLength(1);
    const conflict = sb.status().conflicts[0]; sb.resolve(conflict.id, 'remote'); await sb.run(); await sa.run();
    expect(a.load(p.id).data.company.budgetCents).toBe(234500); expect(b.load(p.id).data.company.budgetCents).toBe(234500); expect(sa.status().conflicts).toHaveLength(0);
    await sb.configure({ ...config, passphrase: 'wrong password phrase' }); await expect(sb.run()).rejects.toThrow(/口令|密文/); expect(b.load(p.id).data.company.budgetCents).toBe(234500);
    online = false; const offline = a.load(p.id); offline.data.company.budgetCents = 100; a.save(p.id, offline.revision, offline.data); await expect(sa.run()).rejects.toThrow(); expect(a.load(p.id).data.company.budgetCents).toBe(100);
  } finally { sa.dispose(); sb.dispose(); server.closeAllConnections(); await new Promise<void>((r) => server.close(() => r())); a.close(); b.close(); dirs.forEach((d) => rmSync(d, { recursive: true, force: true })); }
});
