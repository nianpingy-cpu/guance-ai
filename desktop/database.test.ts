// @vitest-environment node
import { afterEach, expect, it } from 'vitest';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LocalDatabase } from './database';

const opened: LocalDatabase[] = [];
afterEach(() => { for (const d of opened.splice(0)) { d.close(); rmSync(d.directory, { recursive: true, force: true }); } });
function database() { const d = new LocalDatabase(mkdtempSync(join(tmpdir(), 'guance-test-'))); opened.push(d); return d; }
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
  db.db.exec('ALTER TABLE changes DROP COLUMN resolves; PRAGMA user_version=1');
  const upgraded = new LocalDatabase(db.directory);
  expect(upgraded.db.prepare('PRAGMA user_version').get()?.user_version).toBe(2);
  const files = readdirSync(join(db.directory, 'backups')).filter((p) => p.endsWith('.sqlite'));
  expect(files.length).toBeGreaterThan(0);
  const backup = new DatabaseSync(join(db.directory, 'backups', files.at(-1)!), { readOnly: true });
  expect(backup.prepare('SELECT count(*) AS n FROM projects').get()?.n).toBeGreaterThan(0);
  backup.close(); upgraded.close();
});
