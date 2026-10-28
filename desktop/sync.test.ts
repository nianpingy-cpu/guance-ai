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
import { z } from 'zod';
it('blocks a legacy remote before any write and advertises v2 to stop legacy clients', async () => {
  const requests: string[] = []; let manifest: unknown = { version: 1, salt: randomBytes(24).toString('base64'), encrypted: encrypt({ product: 'guance-sync', version: 1 }, randomBytes(32), 'guance-v1:manifest') };
  const server = createServer(async (req, res) => {
    requests.push(req.method!);
    if (req.url?.endsWith('manifest.json')) {
      if (req.method === 'GET') { if (manifest) res.end(JSON.stringify(manifest)); else { res.writeHead(404); res.end(); } }
      else { let body = ''; for await (const chunk of req) body += chunk; manifest = JSON.parse(body); res.writeHead(201); res.end(); }
    } else if (req.method === 'MKCOL') { res.writeHead(201); res.end(); }
    else { res.writeHead(207); res.end('<d:multistatus xmlns:d="DAV:"/>'); }
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve)); const address = server.address(); if (!address || typeof address === 'string') throw new Error('port');
  const dir = mkdtempSync(join(tmpdir(), 'guance-protocol-')); const db = new LocalDatabase(dir); const sync = new SyncService(db, { encrypt: async s => 'enc:' + s, decrypt: async s => s.slice(4) });
  try {
    await sync.configure({ url: `http://127.0.0.1:${address.port}`, username: 'fixture', password: 'fixture', passphrase: 'fixture passphrase', automatic: false });
    const original = JSON.stringify(manifest);
    await expect(sync.run()).rejects.toThrow('旧版同步协议'); expect(requests).toEqual(['GET']); expect(JSON.stringify(manifest)).toBe(original);
    requests.length = 0; manifest = undefined;
    await sync.test(); expect(manifest).toMatchObject({ version: 2 });
    // Exact version gate used by v0.6.1's original manifestSchema, before
    // decryption, directory listing, or operation uploads.
    expect(z.object({ version: z.literal(1), salt: z.string(), encrypted: z.unknown() }).strict().safeParse(manifest).success).toBe(false);
  } finally { sync.dispose(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); db.close(); rmSync(dir, { recursive: true, force: true }); }
});
it('concurrent conflict resolutions remain visible and converge after a subsequent choice', () => {
  const dirs = Array.from({ length: 2 }, () => mkdtempSync(join(tmpdir(), 'guance-resolution-'))); const [a, b] = dirs.map(d => new LocalDatabase(d));
  try {
    const p = a.create('双端解决', 'real'); b.applyRemote(a.changes()[0]);
    for (const [db, budget] of [[a, 111100], [b, 222200]] as const) { const value = db.load(p.id); value.data.company.budgetCents = budget; db.save(p.id, value.revision, value.data); }
    a.applyRemote(b.changes().find(c => c.parentRevision)!); b.applyRemote(a.changes().find(c => c.parentRevision)!);
    a.resolveConflict(a.conflicts()[0].id, 'local'); b.resolveConflict(b.conflicts()[0].id, 'local');
    for (let n = 0; n < 3; n++) { for (const c of a.changes()) b.applyRemote(c); for (const c of b.changes()) a.applyRemote(c); }
    expect(a.conflicts().filter(c => c.projectId === p.id)).toHaveLength(1); expect(b.conflicts().filter(c => c.projectId === p.id)).toHaveLength(1);
    a.resolveConflict(a.conflicts().find(c => c.projectId === p.id)!.id, 'local');
    for (const c of a.changes()) b.applyRemote(c);
    expect(b.load(p.id).revision).toBe(a.load(p.id).revision); expect(b.conflicts().filter(c => c.projectId === p.id)).toHaveLength(0);
  } finally { a.close(); b.close(); dirs.forEach(d => rmSync(d, { recursive: true, force: true })); }
});
it('a new reset operation propagates even when its content matches a historical version', () => {
  const dirs = Array.from({ length: 2 }, () => mkdtempSync(join(tmpdir(), 'guance-reset-sync-'))); const [a, b] = dirs.map(d => new LocalDatabase(d));
  try {
    const p = a.create('重置', 'demo'); b.applyRemote(a.changes()[0]); p.data.company.budgetCents = 600000; a.save(p.id, p.revision, p.data);
    for (const c of a.changes()) b.applyRemote(c); a.resetDemo(p.id); for (const c of a.changes()) b.applyRemote(c);
    expect(b.load(p.id).data.company.budgetCents).toBe(500000); expect(b.conflicts()).toHaveLength(0);
  } finally { a.close(); b.close(); dirs.forEach(d => rmSync(d, { recursive: true, force: true })); }
});
it('requires explicit credentials when the WebDAV origin or account changes', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'guance-sync-account-')); const db = new LocalDatabase(dir); const vault = { encrypt: async (s: string) => 'enc:' + s, decrypt: async (s: string) => s.slice(4) }; const sync = new SyncService(db, vault);
  const config = { url: 'https://first.example/data', username: 'first', password: 'fixture-password', passphrase: 'fixture-sync-phrase', automatic: false };
  try {
    await sync.configure(config);
    await expect(sync.configure({ ...config, url: 'https://second.example/data', password: '', passphrase: '' })).rejects.toThrow(/密码|重新/);
    await expect(sync.configure({ ...config, username: 'second', password: '', passphrase: '' })).rejects.toThrow(/密码|重新/);
    await expect(sync.configure({ ...config, url: 'https://first.example/other', password: '', passphrase: '' })).rejects.toThrow(/口令|重新/);
    expect(sync.status().url).toBe(config.url);
    await sync.configure({ ...config, automatic: true, password: '', passphrase: '' }); expect(sync.status().automatic).toBe(true);
  } finally { sync.dispose(); db.close(); rmSync(dir, { recursive: true, force: true }); }
});
it('密文被篡改或放到另一个变更编号下，认证校验拒绝', () => { const key = randomBytes(32); const value = encrypt({ a: 'business' }, key, 'op:1'); expect(decrypt(value, key, 'op:1')).toEqual({ a: 'business' }); expect(() => decrypt(value, key, 'op:2')).toThrow(/密文/); expect(() => decrypt({ ...value, tag: randomBytes(16).toString('base64') }, key, 'op:1')).toThrow(/密文/); });
it('三个并发版本处理后，每个未选版本都保留为独立项目', () => {
  const dirs = Array.from({ length: 3 }, () => mkdtempSync(join(tmpdir(), 'guance-forks-'))); const [a, b, c] = dirs.map((d) => new LocalDatabase(d));
  try { const p = a.create('三端项目', 'real'); const root = a.changes()[0]; b.applyRemote(root); c.applyRemote(root);
    for (const [db, budget] of [[a, 111100], [b, 222200], [c, 333300]] as const) { const project = db.load(p.id); project.data.company.budgetCents = budget; db.save(p.id, project.revision, project.data); }
    a.applyRemote(b.changes().find((x) => x.parentRevision)!); a.applyRemote(c.changes().find((x) => x.parentRevision)!); expect(a.conflicts()).toHaveLength(2);
    a.resolveConflict(a.conflicts()[0].id, 'remote'); expect(a.conflicts()).toHaveLength(0); expect(a.list()).toHaveLength(3); expect(a.list().map((p) => a.load(p.id).data.company.budgetCents).sort()).toEqual([111100, 222200, 333300]);
  } finally { for (const db of [a, b, c]) db.close(); dirs.forEach((d) => rmSync(d, { recursive: true, force: true })); }
});
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
