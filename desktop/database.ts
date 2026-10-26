import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import type { AppData } from '../src/types/domain';
import type { Project, ProjectSummary } from '../src/types/desktop';
import { createDemoData } from '../src/data/demo';
import { buildPlanFingerprint, checkPlanBudget, planEvidenceIds, snapshotEvidence } from '../src/lib/calculations';
import { parseData, changeSchema } from './schema';
import type { Change } from './schema';

function parseProject(row: Record<string, unknown> | undefined): Project {
  if (!row || typeof row.body !== 'string') throw new Error('项目不存在');
  return { id: String(row.id), name: String(row.name), mode: row.mode === 'real' ? 'real' : 'demo', revision: String(row.revision), updatedAt: String(row.updated_at), data: parseData(JSON.parse(row.body)) };
}
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
  return JSON.stringify(value);
}
function revision(data: AppData): string { return createHash('sha256').update(canonical(data)).digest('hex'); }
export class LocalDatabase {
  readonly db: DatabaseSync;
  constructor(readonly directory: string) {
    mkdirSync(directory, { recursive: true });
    this.db = new DatabaseSync(join(directory, 'guance.sqlite'));
    this.db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
    const version = Number(this.db.prepare('PRAGMA user_version').get()?.user_version ?? 0);
    if (version > 2) throw new Error('数据库版本高于当前应用，请升级应用');
    if (version === 0) {
      this.db.exec(`BEGIN; CREATE TABLE projects (id TEXT PRIMARY KEY, name TEXT NOT NULL, mode TEXT NOT NULL, revision TEXT NOT NULL, body TEXT NOT NULL, updated_at TEXT NOT NULL);
        CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
        CREATE TABLE changes (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, parent_revision TEXT NOT NULL, revision TEXT NOT NULL, body TEXT NOT NULL, created_at TEXT NOT NULL, resolves TEXT NOT NULL DEFAULT '[]');
        CREATE TABLE applied (id TEXT PRIMARY KEY);
        CREATE TABLE conflicts (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, body TEXT NOT NULL, created_at TEXT NOT NULL);
        CREATE TABLE jobs (id TEXT PRIMARY KEY, body TEXT NOT NULL);
        PRAGMA user_version=2; COMMIT;`);
    }
    if (version === 1) { this.backup(); this.db.exec("BEGIN; ALTER TABLE changes ADD COLUMN resolves TEXT NOT NULL DEFAULT '[]'; INSERT OR IGNORE INTO applied SELECT id FROM changes; PRAGMA user_version=2; COMMIT;"); }
  }
  list(): ProjectSummary[] { return this.db.prepare('SELECT id,name,mode,revision,updated_at FROM projects ORDER BY updated_at DESC, id').all().map((row) => ({ id: String(row.id), name: String(row.name), mode: row.mode === 'real' ? 'real' : 'demo', revision: String(row.revision), updatedAt: String(row.updated_at) })); }
  load(id: string): Project { return parseProject(this.db.prepare('SELECT * FROM projects WHERE id=?').get(id)); }
  create(name: string, mode: 'demo' | 'real' = 'real'): Project {
    const data = createDemoData(); data.mode = mode;
    if (mode === 'real') {
      data.company = { ...data.company, id: randomUUID(), name, brand: name, industry: '', region: '', stage: '', product: '待填写产品', productSpec: '', goal: '填写本轮营销目标', budgetCents: 100000, campaignStart: new Date().toISOString().slice(0, 10), campaignEnd: new Date().toISOString().slice(0, 10), updatedAt: new Date().toISOString() };
      data.sources = []; data.signals = []; data.themes = []; data.opportunities = []; data.approvals = []; data.reviews = []; data.feedbackTasks = [];
      data.plans = data.plans.map((p) => ({ ...p, name: `方案 ${p.code}（待编辑）`, shortName: `方案 ${p.code}`, positioning: '', audience: '', formats: [], timing: '', coreMessage: '', rationale: '', constraints: [], uncertainties: [], evidenceThemeIds: [], channels: p.channels.map((c) => ({ ...c, budgetCents: 0, role: '' })) }));
      data.decision = { status: 'pending', planId: null, updatedAt: new Date().toISOString() };
    }
    return this.insert(name.trim(), data);
  }
  private insert(name: string, data: AppData): Project {
    if (!name || name.length > 200) throw new Error('项目名称需为1–200字');
    const p: Project = { id: randomUUID(), name, mode: data.mode === 'real' ? 'real' : 'demo', revision: revision(data), data, updatedAt: new Date().toISOString() };
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db.prepare('INSERT INTO projects VALUES(?,?,?,?,?,?)').run(p.id, name, p.mode, p.revision, JSON.stringify(data), p.updatedAt);
      this.record(p, ''); this.db.exec('COMMIT'); return p;
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  save(id: string, expected: string, value: unknown): Project {
    const data = parseData(value);
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const before = this.load(id);
      if (before.revision !== expected) throw new Error('CONFLICT:项目已被其他操作更新，请重新加载');
      if (data.mode !== before.data.mode) throw new Error('不能变更项目数据模式');
      for (const approval of before.data.approvals) {
        if (JSON.stringify(data.approvals.find((a) => a.id === approval.id)) !== JSON.stringify(approval)) throw new Error('历史审批快照不可修改或删除');
      }
      for (const approval of data.approvals.filter((a) => !before.data.approvals.some((old) => old.id === a.id))) {
        const plan = data.plans.find((p) => p.id === approval.planId);
        if (!plan || !checkPlanBudget(plan, data.company.budgetCents).ok || !approval.reason.trim()) throw new Error('审批预算或理由无效');
        const ids = planEvidenceIds(plan, data);
        if (plan.analysisId && (!ids.length || !data.analyses?.some((a) => a.id === plan.analysisId) || ids.some((id) => !data.signals.some((s) => s.id === id && s.status !== 'disputed' && s.status !== 'duplicate')))) throw new Error('模型方案缺少有效引用，不能审批');
        const evidence = snapshotEvidence(data.signals, ids);
        if (JSON.stringify(approval.plan) !== JSON.stringify(plan) || approval.companyBudgetCents !== data.company.budgetCents || approval.fingerprint !== buildPlanFingerprint(plan, data.company.budgetCents, evidence) || JSON.stringify(approval.evidence) !== JSON.stringify(evidence) || JSON.stringify(approval.evidenceSignalIds) !== JSON.stringify(ids)) throw new Error('审批依据与当前版本不一致');
      }
      const p = { ...before, revision: revision(data), data, updatedAt: new Date().toISOString() };
      if (p.revision !== before.revision) {
        this.db.prepare('UPDATE projects SET revision=?, body=?, updated_at=? WHERE id=?').run(p.revision, JSON.stringify(data), p.updatedAt, id);
        this.record(p, before.revision);
      }
      this.db.exec('COMMIT'); return p;
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  record(project: Project, parent: string, resolves: string[] = []) {
    const id = randomUUID();
    this.db.prepare('INSERT INTO changes VALUES(?,?,?,?,?,?,?)').run(id, project.id, parent, project.revision, JSON.stringify(project), project.updatedAt, JSON.stringify(resolves));
    this.db.prepare('INSERT OR IGNORE INTO applied VALUES(?)').run(id);
  }
  changes(): Change[] { return this.db.prepare('SELECT * FROM changes ORDER BY created_at,id').all().map((r) => changeSchema.parse({ id: r.id, projectId: r.project_id, parentRevision: r.parent_revision, revision: r.revision, project: JSON.parse(String(r.body)), createdAt: r.created_at, resolves: JSON.parse(String(r.resolves)) })); }
  conflicts(): Change[] { return this.db.prepare('SELECT body FROM conflicts ORDER BY created_at,id').all().map((r) => changeSchema.parse(JSON.parse(String(r.body)))); }
  private ancestor(projectId: string, older: string, newer: string): boolean {
    const history = this.changes().filter((c) => c.projectId === projectId); const todo = [newer]; const seen = new Set<string>();
    while (todo.length) { const rev = todo.pop()!; if (rev === older) return true; if (seen.has(rev)) continue; seen.add(rev); for (const c of history.filter((c) => c.revision === rev)) todo.push(c.parentRevision, ...c.resolves); }
    return false;
  }
  applyRemote(value: unknown): 'applied' | 'pending' {
    const c = changeSchema.parse(value); parseData(c.project.data);
    if (c.projectId !== c.project.id || c.revision !== c.project.revision || c.revision !== revision(c.project.data) || c.project.mode !== (c.project.data.mode ?? 'demo')) throw new Error('同步记录摘要或项目标识无效');
    if (this.db.prepare('SELECT id FROM applied WHERE id=?').get(c.id)) return 'applied';
    const row = this.db.prepare('SELECT * FROM projects WHERE id=?').get(c.projectId); const current = row ? parseProject(row) : undefined;
    if (c.parentRevision && !this.changes().some((h) => h.projectId === c.projectId && h.revision === c.parentRevision) && current?.revision !== c.parentRevision && !c.resolves.includes(current?.revision ?? '')) return 'pending';
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const covered = current && this.ancestor(c.projectId, c.revision, current.revision);
      const replace = !current || current.revision === c.parentRevision || c.resolves.includes(current.revision);
      if (replace && !covered) this.db.prepare('INSERT INTO projects VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,mode=excluded.mode,revision=excluded.revision,body=excluded.body,updated_at=excluded.updated_at').run(c.project.id, c.project.name, c.project.mode, c.revision, JSON.stringify(c.project.data), c.project.updatedAt);
      else if (!covered && current?.revision !== c.revision) this.db.prepare('INSERT OR IGNORE INTO conflicts VALUES(?,?,?,?)').run(c.id, c.projectId, JSON.stringify(c), c.createdAt);
      this.db.prepare('INSERT OR IGNORE INTO changes VALUES(?,?,?,?,?,?,?)').run(c.id, c.projectId, c.parentRevision, c.revision, JSON.stringify(c.project), c.createdAt, JSON.stringify(c.resolves));
      this.db.prepare('INSERT INTO applied VALUES(?)').run(c.id);
      for (const conflict of this.conflicts().filter((x) => x.projectId === c.projectId && c.resolves.includes(x.revision))) this.db.prepare('DELETE FROM conflicts WHERE id=?').run(conflict.id);
      this.db.exec('COMMIT'); return 'applied';
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  resolveConflict(id: string, choice: 'local' | 'remote') {
    const conflict = this.conflicts().find((c) => c.id === id); if (!conflict) throw new Error('冲突不存在');
    const current = this.load(conflict.projectId); this.backup();
    const losing = choice === 'remote' ? current : conflict.project;
    this.insert(`${losing.name.slice(0, 160)} · 冲突保留`, losing.data);
    const chosen = choice === 'remote' ? conflict.project : current;
    const resolved = this.conflicts().filter((c) => c.projectId === current.id); const resolves = [...new Set([current.revision, ...resolved.map((c) => c.revision)])];
    this.db.exec('BEGIN IMMEDIATE');
    try { const next = { ...chosen, id: current.id, updatedAt: new Date().toISOString() }; this.db.prepare('UPDATE projects SET name=?,mode=?,revision=?,body=?,updated_at=? WHERE id=?').run(next.name, next.mode, next.revision, JSON.stringify(next.data), next.updatedAt, next.id); this.record(next, current.revision, resolves); this.db.prepare('DELETE FROM conflicts WHERE project_id=?').run(current.id); this.db.exec('COMMIT'); }
    catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  import(name: string, snapshot: unknown): Project {
    const candidate = snapshot && typeof snapshot === 'object' && 'data' in snapshot ? snapshot.data : snapshot;
    const data = parseData(candidate);
    const hash = revision(data);
    const existing = this.db.prepare('SELECT * FROM projects WHERE revision=?').get(hash);
    if (existing) return parseProject(existing);
    this.backup(); return this.insert(name, data);
  }
  backup(): { filename: string } {
    const filename = `guance-${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}.sqlite`;
    mkdirSync(join(this.directory, 'backups'), { recursive: true });
    this.db.prepare('VACUUM INTO ?').run(join(this.directory, 'backups', filename)); return { filename };
  }
  resetDemo(id: string): Project {
    const p = this.load(id); if (p.mode !== 'demo') throw new Error('真实项目不能恢复为演示数据');
    this.backup(); const data = createDemoData(); data.mode = 'demo';
    const next = { ...p, data, revision: revision(data), updatedAt: new Date().toISOString() };
    this.db.exec('BEGIN IMMEDIATE');
    try { this.db.prepare('UPDATE projects SET revision=?, body=?, updated_at=? WHERE id=?').run(next.revision, JSON.stringify(data), next.updatedAt, id); this.record(next, p.revision); this.db.exec('COMMIT'); return next; }
    catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  setting<T>(key: string, fallback: T): T { const row = this.db.prepare('SELECT value FROM settings WHERE key=?').get(key); return typeof row?.value === 'string' ? JSON.parse(row.value) as T : fallback; }
  setSetting(key: string, value: unknown) { this.db.prepare('INSERT INTO settings VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key, JSON.stringify(value)); }
  close() { this.db.close(); }
}
