import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Job } from '../src/types/desktop';
import { LocalDatabase } from './database';
const jobSchema = z.object({ id: z.string(), projectId: z.string(), kind: z.enum(['analysis', 'collect']), status: z.enum(['running', 'completed', 'failed', 'cancelled', 'interrupted']), progress: z.string(), createdAt: z.string(), error: z.string().optional(), result: z.string().optional() });
export class Jobs {
  private controllers = new Map<string, AbortController>();
  constructor(private db: LocalDatabase) { for (const j of this.all().filter((j) => j.status === 'running')) this.save({ ...j, status: 'interrupted', progress: '应用上次关闭，任务已中断。请手动重试，模型可能已计费。' }); }
  all(): Job[] { return this.db.db.prepare('SELECT body FROM jobs').all().map((row) => jobSchema.parse(JSON.parse(String(row.body)))); }
  list(projectId: string) { return this.all().filter((j) => j.projectId === projectId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)); }
  private save(job: Job) { this.db.db.prepare('INSERT INTO jobs VALUES(?,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body').run(job.id, JSON.stringify(job)); }
  start(projectId: string, kind: Job['kind'], operation: (signal: AbortSignal, progress: (text: string) => void) => Promise<string>): Job {
    if (this.list(projectId).some((j) => j.status === 'running' && j.kind === kind)) throw new Error('同类任务正在运行，请等待或取消');
    const job: Job = { id: randomUUID(), projectId, kind, status: 'running', progress: '正在准备', createdAt: new Date().toISOString() };
    const controller = new AbortController(); this.controllers.set(job.id, controller); this.save(job);
    void Promise.resolve().then(() => operation(controller.signal, (progress) => this.save({ ...job, progress }))).then((result) => { this.save({ ...job, status: controller.signal.aborted ? 'cancelled' : 'completed', progress: controller.signal.aborted ? '已取消' : '已完成', result }); }).catch((e: unknown) => this.save({ ...job, status: controller.signal.aborted ? 'cancelled' : 'failed', progress: '任务已结束', error: e instanceof Error ? e.message : '任务失败' })).finally(() => this.controllers.delete(job.id));
    return job;
  }
  cancel(id: string) { const controller = this.controllers.get(id); if (!controller) throw new Error('任务已结束或不存在'); controller.abort(); }
}
