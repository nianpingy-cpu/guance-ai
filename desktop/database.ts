import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import type { AppData } from '../src/types/domain';
import type { Project, ProjectSummary } from '../src/types/desktop';
import { createDemoData } from '../src/data/demo';
import { buildPlanFingerprint, checkPlanBudget, planEvidenceIds, snapshotEvidence } from '../src/lib/calculations';
import { parseData } from './schema';

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
    if (version > 1) throw new Error('数据库版本高于当前应用，请升级应用');
    if (version === 0) {
      this.db.exec(`BEGIN; CREATE TABLE projects (id TEXT PRIMARY KEY, name TEXT NOT NULL, mode TEXT NOT NULL, revision TEXT NOT NULL, body TEXT NOT NULL, updated_at TEXT NOT NULL);
        CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
        CREATE TABLE changes (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, parent_revision TEXT NOT NULL, revision TEXT NOT NULL, body TEXT NOT NULL, created_at TEXT NOT NULL);
        CREATE TABLE applied (id TEXT PRIMARY KEY);
        CREATE TABLE conflicts (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, body TEXT NOT NULL, created_at TEXT NOT NULL);
        CREATE TABLE jobs (id TEXT PRIMARY KEY, body TEXT NOT NULL);
        PRAGMA user_version=1; COMMIT;`);
    }
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
  record(project: Project, parent: string) {
    this.db.prepare('INSERT INTO changes VALUES(?,?,?,?,?,?)').run(randomUUID(), project.id, parent, project.revision, JSON.stringify(project), project.updatedAt);
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
