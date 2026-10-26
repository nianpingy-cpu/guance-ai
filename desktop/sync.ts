import { randomBytes, pbkdf2, createCipheriv, createDecipheriv } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { setInterval, clearInterval } from 'node:timers';
import { XMLParser } from 'fast-xml-parser';
import { z } from 'zod';
import { LocalDatabase } from './database';
import type { Vault } from './models';
import { checkedFetch, endpoint } from './network';
import { changeSchema } from './schema';
export const syncConfigSchema = z.object({ url: z.string().min(1).max(2000), username: z.string().max(200), password: z.string().max(16000).optional(), passphrase: z.string().max(16000).optional(), automatic: z.boolean() }).strict();
const base64 = z.string().regex(/^[A-Za-z0-9+/]*={0,2}$/);
const envelopeSchema = z.object({ iv: base64.max(24), tag: base64.max(32), data: base64.max(28_000_000) }).strict();
type Envelope = z.infer<typeof envelopeSchema>;
const manifestSchema = z.object({ version: z.literal(1), salt: base64.min(24).max(64), encrypted: envelopeSchema }).strict();
type Config = { url: string; username: string; passwordCipher: string; phraseCipher: string; automatic: boolean };
function derive(phrase: string, salt: string): Promise<Buffer> { return new Promise((resolve, reject) => pbkdf2(phrase, Buffer.from(salt, 'base64'), 310000, 32, 'sha256', (error, key) => error ? reject(error) : resolve(key))); }
export function encrypt(value: unknown, key: Buffer, context: string): Envelope { const iv = randomBytes(12); const cipher = createCipheriv('aes-256-gcm', key, iv); cipher.setAAD(Buffer.from(context)); const body = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]); return { iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), data: body.toString('base64') }; }
export function decrypt(value: unknown, key: Buffer, context: string): unknown { try { const e = envelopeSchema.parse(value); const iv = Buffer.from(e.iv, 'base64'); const tag = Buffer.from(e.tag, 'base64'); if (iv.length !== 12 || tag.length !== 16) throw new Error('invalid'); const decipher = createDecipheriv('aes-256-gcm', key, iv); decipher.setAuthTag(tag); decipher.setAAD(Buffer.from(context)); return JSON.parse(Buffer.concat([decipher.update(Buffer.from(e.data, 'base64')), decipher.final()]).toString('utf8')); } catch { throw new Error('同步口令错误或密文损坏；未应用该记录'); } }
export class SyncService {
  private busy = false;
  private timer: ReturnType<typeof setInterval>;
  constructor(private db: LocalDatabase, private vault: Vault) { this.timer = setInterval(() => { if (this.config()?.automatic && !this.busy) void this.run().catch(() => undefined); }, 60000); this.timer.unref(); }
  private config(): Config | null { return this.db.setting<Config | null>('sync.config', null); }
  status() { const c = this.config(); return { configured: Boolean(c), url: c?.url ?? '', username: c?.username ?? '', automatic: c?.automatic ?? false, busy: this.busy, ...this.db.setting<{ lastSuccess: string; error: string }>('sync.status', { lastSuccess: '', error: '' }), conflicts: this.db.conflicts().map((c) => ({ id: c.id, projectId: c.projectId, name: c.project.name, remoteRevision: c.revision, remoteUpdatedAt: c.project.updatedAt, remoteBudgetCents: c.project.data.company.budgetCents, localBudgetCents: this.db.load(c.projectId).data.company.budgetCents })) }; }
  async configure(value: unknown) { if (this.busy) throw new Error('请等待同步完成再修改配置'); const p = syncConfigSchema.parse(value); endpoint(p.url); const before = this.config(); const passwordCipher = p.password ? await this.vault.encrypt(p.password) : before?.passwordCipher; const phraseCipher = p.passphrase ? await this.vault.encrypt(p.passphrase) : before?.phraseCipher; if (p.passphrase && p.passphrase.length < 12) throw new Error('同步口令至少12字符'); if (!passwordCipher || !phraseCipher) throw new Error('首次配置请填写WebDAV密码和独立同步口令'); this.db.setSetting('sync.config', { url: p.url.replace(/\/$/, ''), username: p.username, passwordCipher, phraseCipher, automatic: p.automatic }); }
  disconnect() { if (this.busy) throw new Error('同步进行中，请等待完成'); this.db.setSetting('sync.config', null); }
  private async remote() {
    const config = this.config(); if (!config) throw new Error('请先配置WebDAV同步'); const password = await this.vault.decrypt(config.passwordCipher); const phrase = await this.vault.decrypt(config.phraseCipher);
    const root = `${config.url}/guance-v1/`;
    const dav = (method: string, path: string, body?: string, accepted: number[] = []) => checkedFetch(new URL(path, root), { method, headers: { authorization: `Basic ${Buffer.from(`${config.username}:${password}`).toString('base64')}`, ...(method === 'PROPFIND' ? { depth: '1', 'content-type': 'application/xml' } : { 'content-type': 'application/json' }), ...(method === 'PUT' ? { 'if-none-match': '*' } : {}) }, body, signal: AbortSignal.timeout(30000) }, 24_000_000, accepted);
    await dav('MKCOL', '', undefined, [405]);
    let response = await dav('GET', 'manifest.json', undefined, [404]);
    if (response.status === 404) {
      const salt = randomBytes(24).toString('base64'); const key = await derive(phrase, salt); const manifest = { version: 1, salt, encrypted: encrypt({ product: 'guance-sync', version: 1 }, key, 'guance-v1:manifest') };
      await dav('PUT', 'manifest.json', JSON.stringify(manifest), [412]); response = await dav('GET', 'manifest.json');
    }
    const manifest = manifestSchema.parse(await response.json()); const key = await derive(phrase, manifest.salt);
    const proof = decrypt(manifest.encrypted, key, 'guance-v1:manifest'); z.object({ product: z.literal('guance-sync'), version: z.literal(1) }).parse(proof);
    return { dav, key, root };
  }
  async test() { const { dav } = await this.remote(); await dav('PROPFIND', '', '<?xml version="1.0"?><d:propfind xmlns:d="DAV:"><d:prop><d:resourcetype/></d:prop></d:propfind>'); return 'WebDAV连接成功，读写权限与同步口令已验证'; }
  async run() {
    if (this.busy) throw new Error('同步正在进行'); this.busy = true;
    try {
      const { dav, key, root } = await this.remote();
      const listing = await (await dav('PROPFIND', '', '<?xml version="1.0"?><d:propfind xmlns:d="DAV:"><d:prop><d:resourcetype/></d:prop></d:propfind>')).text();
      if (/<!DOCTYPE|<!ENTITY/i.test(listing)) throw new Error('不接受不安全的WebDAV目录响应');
      const parsed: unknown = new XMLParser({ removeNSPrefix: true, ignoreAttributes: true, isArray: (name) => name === 'response', processEntities: false }).parse(listing);
      const list = z.object({ multistatus: z.object({ response: z.array(z.object({ href: z.string() })).optional() }) }).parse(parsed).multistatus.response ?? [];
      const names = new Set(list.flatMap((r) => { const u = new URL(r.href, root); if (u.origin !== new URL(root).origin || !u.pathname.startsWith(new URL(root).pathname)) return []; const name = decodeURIComponent(u.pathname.slice(new URL(root).pathname.length)); return /^[\da-f-]{36}\.op\.json$/i.test(name) ? [name] : []; }));
      if (names.size > 20000) throw new Error('同步记录超过首版容量，请先导出备份并联系维护者归档');
      for (const c of this.db.changes()) if (!names.has(`${c.id}.op.json`)) await dav('PUT', `${c.id}.op.json`, JSON.stringify(encrypt(c, key, `guance-v1:${c.id}`)), [412]);
      const incoming = [];
      for (const name of names) { const id = name.slice(0, -8); if (this.db.db.prepare('SELECT id FROM applied WHERE id=?').get(id)) continue; const encrypted: unknown = await (await dav('GET', name)).json(); const c = changeSchema.parse(decrypt(encrypted, key, `guance-v1:${id}`)); if (c.id !== id) throw new Error('变更编号与密文文件名不一致'); incoming.push(c); }
      let pending = incoming; let progress = true;
      while (pending.length && progress) { const remaining = []; progress = false; for (const c of pending) { if (this.db.applyRemote(c) === 'pending') remaining.push(c); else progress = true; } pending = remaining; }
      if (pending.length) throw new Error(`${pending.length}条变更缺少前序版本，已保留本机数据，请重试或核对远端备份`);
      this.db.setSetting('sync.status', { lastSuccess: new Date().toISOString(), error: '' }); return { ...this.status(), busy: false };
    } catch (e) { this.db.setSetting('sync.status', { ...this.db.setting('sync.status', { lastSuccess: '' }), error: e instanceof Error ? e.message : '同步失败' }); throw e; }
    finally { this.busy = false; }
  }
  resolve(id: string, choice: 'local' | 'remote') { if (this.busy) throw new Error('请等待同步完成'); this.db.resolveConflict(id, choice); }
  dispose() { clearInterval(this.timer); }
}
