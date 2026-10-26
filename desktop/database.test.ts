// @vitest-environment node
import { afterEach, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
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
