// @vitest-environment node
import { afterEach, expect, it } from 'vitest';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Worker } from 'node:worker_threads';
import { once } from 'node:events';
import { LocalDatabase } from './database';

const opened: LocalDatabase[] = [];
afterEach(() => { for (const d of opened.splice(0)) { d.close(); rmSync(d.directory, { recursive: true, force: true }); } });
function database() { const d = new LocalDatabase(mkdtempSync(join(tmpdir(), 'guance-test-'))); opened.push(d); return d; }
it('waits for a previous SQLite writer before configuring WAL on immediate restart', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'guance-restart-'));
  const writer = new Worker(`
    const { workerData, parentPort } = require('node:worker_threads');
    const { DatabaseSync } = require('node:sqlite');
    const db = new DatabaseSync(workerData);
    db.exec('CREATE TABLE held(value INTEGER); BEGIN EXCLUSIVE; INSERT INTO held VALUES(1)');
    parentPort.postMessage('locked');
    setTimeout(() => { db.exec('COMMIT'); db.close(); }, 250);
  `, { eval: true, workerData: join(directory, 'guance.sqlite') });
  const exited = once(writer, 'exit');
  let reopened: LocalDatabase | undefined;
  try {
    await once(writer, 'message');
    reopened = new LocalDatabase(directory);
    expect(reopened.db.prepare('SELECT value FROM held').get()?.value).toBe(1);
    expect(reopened.db.prepare('PRAGMA journal_mode').get()?.journal_mode).toBe('wal');
  } finally { await exited; if (reopened) { reopened.close(); rmSync(directory, { recursive: true, force: true }); } }
});
it('persists projects across connections and separates real data from the demo', () => {
  const db = database(); const demo = db.create('样例', 'demo'); const real = db.create('真实项目');
  expect(real.data.signals).toHaveLength(0); expect(real.data.approvals).toHaveLength(0);
  const second = new LocalDatabase(db.directory); expect(second.load(demo.id).data.company.budgetCents).toBe(500000); second.close();
});
it('rejects stale writes and immutable approval changes atomically', () => {
  const db = database(); const p = db.create('演示', 'demo'); const next = structuredClone(p.data); next.company.budgetCents = 600000;
  const saved = db.save(p.id, p.revision, next);
  expect(() => db.save(p.id, p.revision, next)).toThrow('CONFLICT');
  next.approvals[0].reason = '篡改'; expect(() => db.save(p.id, saved.revision, next)).toThrow('不可修改');
  expect(db.load(p.id).data.approvals[0].reason).not.toBe('篡改');
});
it('validates imported data and deduplicates repeated imports', () => {
  const db = database(); const p = db.create('演示', 'demo');
  expect(db.import('重复', { data: p.data }).id).toBe(p.id);
  expect(() => db.import('损坏', { data: { ...p.data, signals: [{}] } })).toThrow();
  expect(() => db.import('负数', { data: { ...p.data, company: { ...p.data.company, budgetCents: -1 } } })).toThrow();
  expect(db.list()).toHaveLength(1); expect(db.backup().filename).toMatch(/\.sqlite$/);
});
it('rolls back creating a project when its change log cannot be written', () => {
  const db = database();
  db.db.exec("CREATE TRIGGER fail_changes BEFORE INSERT ON changes BEGIN SELECT RAISE(ABORT, 'test failure'); END");
  expect(() => db.create('不应残留')).toThrow('test failure');
  expect(db.list()).toHaveLength(0);
});
it('rejects duplicate channel identities at the storage boundary', () => {
  const db = database(); const p = db.create('演示', 'demo');
  p.data.plans[0].channels.push(p.data.plans[0].channels[0]);
  expect(() => db.save(p.id, p.revision, p.data)).toThrow('渠道');
});
it('导入被改动的审批或未知复盘渠道会拒绝', () => { const db = database(); const p = db.create('demo', 'demo'); const changed = structuredClone(p.data); changed.approvals[0].plan.coreMessage = '被改动'; expect(() => db.import('bad', changed)).toThrow('完整性'); const review = structuredClone(p.data); review.reviews[0].channels[0].channel = '未知渠道'; expect(() => db.import('bad', review)).toThrow('复盘渠道'); });
it('编辑期间版本被同步更新，未保存的编辑保留为可处理冲突', () => {
  const db = database(); const p = db.create('并发编辑', 'real'); const remote = structuredClone(p.data); remote.company.budgetCents = 888800; db.save(p.id, p.revision, remote);
  const editing = structuredClone(p.data); editing.company.goal = '用户未保存的长文目标';
  expect(() => db.save(p.id, p.revision, editing)).toThrow('CONFLICT');
  expect(db.load(p.id).data.company.budgetCents).toBe(888800);
  expect(db.conflicts()[0].project.data.company.goal).toBe('用户未保存的长文目标');
});
it('旧Web导出可导入、修改并重开；数据库升级前保留可读备份', () => {
  const db = database(); const demo = db.create('旧数据', 'demo'); delete demo.data.mode;
  const imported = db.import('迁移', demo.data); const value = structuredClone(imported.data); value.company.budgetCents = 666600;
  expect(db.save(imported.id, imported.revision, value).data.mode).toBe('demo');
  db.db.exec('ALTER TABLE changes DROP COLUMN resolves; ALTER TABLE changes DROP COLUMN parent_ids; DROP TABLE project_heads; PRAGMA user_version=1');
  const upgraded = new LocalDatabase(db.directory);
  expect(upgraded.db.prepare('PRAGMA user_version').get()?.user_version).toBe(3);
  const files = readdirSync(join(db.directory, 'backups')).filter((p) => p.endsWith('.sqlite'));
  expect(files.length).toBeGreaterThan(0);
  const backup = new DatabaseSync(join(db.directory, 'backups', files.at(-1)!), { readOnly: true });
  expect(backup.prepare('SELECT count(*) AS n FROM projects').get()?.n).toBeGreaterThan(0);
  backup.close(); upgraded.close();
});
it('migrates v2 with readable backup, audit history and independent conflict checkpoints', () => {
  const db = database(); const p = db.create('升级并发', 'real'); const remote = structuredClone(p.data); remote.company.budgetCents = 888800; db.save(p.id, p.revision, remote);
  const local = structuredClone(p.data); local.company.goal = '旧冲突保留'; expect(() => db.save(p.id, p.revision, local)).toThrow('CONFLICT');
  const oldIds = db.changes().map(c => c.id);
  db.db.exec('ALTER TABLE changes DROP COLUMN parent_ids; DROP TABLE project_heads; PRAGMA user_version=2');
  const upgraded = new LocalDatabase(db.directory);
  try {
    expect(upgraded.load(p.id).data.company.budgetCents).toBe(888800); expect(upgraded.conflicts()[0].project.data.company.goal).toBe('旧冲突保留');
    expect(upgraded.changes().filter(c => oldIds.includes(c.id))).toHaveLength(oldIds.length);
    expect(upgraded.changes().filter(c => c.parents !== undefined)).toHaveLength(2);
    const peer = database(); for (const c of upgraded.changes().filter(c => c.parents !== undefined)) peer.applyRemote(c);
    expect(peer.conflicts()).toHaveLength(1);
    const files = readdirSync(join(db.directory, 'backups')).filter(p => p.endsWith('.sqlite'));
    const backup = new DatabaseSync(join(db.directory, 'backups', files.at(-1)!), { readOnly: true });
    expect(backup.prepare('PRAGMA user_version').get()?.user_version).toBe(2); expect(backup.prepare('SELECT count(*) AS n FROM changes').get()?.n).toBe(oldIds.length); backup.close();
  } finally { upgraded.close(); }
});
it('does not infer legacy event ancestry from a matching content hash', () => {
  const db = database(); const p = db.create('旧事件', 'real'); const c = db.changes()[0]; const legacy = { ...c }; delete legacy.parents;
  expect(() => db.applyRemote(legacy)).toThrow('旧版同步'); expect(db.load(p.id).revision).toBe(p.revision);
});
it('waits for precise event parents even when their content hash is already known', () => {
  const source = database(), target = database(); const p = source.create('乱序', 'demo'); const root = source.changes()[0]; target.applyRemote(root);
  p.data.company.budgetCents = 600000; source.save(p.id, p.revision, p.data); source.resetDemo(p.id);
  const all = source.changes(); const reset = all.find(c => c.id !== root.id && c.revision === root.revision)!;
  expect(target.applyRemote(reset)).toBe('pending');
  for (const c of all) target.applyRemote(c);
  expect(target.load(p.id).data.company.budgetCents).toBe(500000); expect(target.conflicts()).toHaveLength(0);
});
it('rolls back a failed v2 upgrade without changing business data or schema', () => {
  const db = database(); const p = db.create('升级故障', 'real');
  db.db.exec("ALTER TABLE changes DROP COLUMN parent_ids; DROP TABLE project_heads; PRAGMA user_version=2; CREATE TRIGGER fail_checkpoint BEFORE INSERT ON changes BEGIN SELECT RAISE(ABORT, 'checkpoint failure'); END");
  expect(() => new LocalDatabase(db.directory)).toThrow('checkpoint failure');
  expect(db.db.prepare('PRAGMA user_version').get()?.user_version).toBe(2);
  expect(db.load(p.id).data).toEqual(p.data);
  expect(db.db.prepare('PRAGMA table_info(changes)').all().some(row => row.name === 'parent_ids')).toBe(false);
  const files = readdirSync(join(db.directory, 'backups')).filter(name => name.endsWith('.sqlite'));
  const backup = new DatabaseSync(join(db.directory, 'backups', files.at(-1)!), { readOnly: true });
  expect(backup.prepare('SELECT count(*) AS n FROM projects').get()?.n).toBe(1); backup.close();
});
