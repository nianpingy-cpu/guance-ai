import { z } from 'zod';
import type { Command } from '../src/types/desktop';
import { LocalDatabase } from './database';
import { ModelService, providerSchema } from './models';
import type { Vault } from './models';
import { CollectionService, collectionSchema, platformSchema } from './collect';
import { SyncService, syncConfigSchema } from './sync';

const id = z.string().min(1).max(200);
export const commands = {
  'sync.preview': z.object({ id }).strict(),
  'sync.status': z.undefined(), 'sync.configure': syncConfigSchema, 'sync.test': z.undefined(), 'sync.run': z.undefined(), 'sync.disconnect': z.undefined(), 'sync.resolve': z.object({ id, choice: z.enum(['local', 'remote']) }).strict(),
  'collect.start': collectionSchema, 'collect.retry': z.object({ id }).strict(),
  'connections.list': z.undefined(), 'connections.save': platformSchema, 'connections.remove': z.object({ platform: z.enum(['wechat', 'xiaohongshu', 'douyin']) }).strict(),
  'models.list': z.undefined(), 'models.save': providerSchema, 'models.remove': z.object({ id }).strict(), 'models.default': z.object({ id }).strict(), 'models.discover': z.object({ id }).strict(), 'models.test': z.object({ id }).strict(),
  'models.analyze': z.object({ projectId: id, signalIds: z.array(id).min(1).max(100) }).strict(),
  'jobs.list': z.object({ projectId: id }).strict(), 'jobs.cancel': z.object({ id }).strict(),
  'projects.list': z.undefined(),
  'projects.create': z.object({ name: id, mode: z.enum(['demo', 'real']) }).strict(),
  'projects.load': z.object({ id }).strict(),
  'projects.save': z.object({ id, revision: id, data: z.unknown() }).strict(),
  'projects.import': z.object({ name: id, snapshot: z.unknown() }).strict(),
  'projects.backup': z.undefined(),
  'projects.resetDemo': z.object({ id }).strict(),
};
export class DesktopService {
  readonly models: ModelService;
  readonly collect: CollectionService;
  readonly sync: SyncService;
  constructor(readonly database: LocalDatabase, vault: Vault) { this.models = new ModelService(database, vault); this.collect = new CollectionService(database, this.models.jobs, vault); this.sync = new SyncService(database, vault); }
  async execute(command: string, input: unknown): Promise<unknown> {
    if (!Object.hasOwn(commands, command)) throw new Error('不支持的操作');
    const name = command as Command;
    const value = commands[name].parse(input);
    switch (name) {
      case 'sync.preview': { const c = this.database.conflicts().find((c) => c.id === commands[name].parse(value).id); if (!c) throw new Error('冲突不存在'); return { local: this.database.load(c.projectId), remote: c.project }; }
      case 'sync.status': return this.sync.status();
      case 'sync.configure': return this.sync.configure(value);
      case 'sync.test': return this.sync.test();
      case 'sync.run': return this.sync.run();
      case 'sync.disconnect': return this.sync.disconnect();
      case 'sync.resolve': { const p = commands[name].parse(value); return this.sync.resolve(p.id, p.choice); }
      case 'collect.start': return this.collect.start(commands[name].parse(value));
      case 'collect.retry': return this.collect.retry(commands[name].parse(value).id);
      case 'connections.list': return this.collect.connections();
      case 'connections.save': return this.collect.saveConnection(value);
      case 'connections.remove': return this.collect.removeConnection(commands[name].parse(value).platform);
      case 'models.list': return this.models.list();
      case 'models.save': return this.models.save(value);
      case 'models.remove': return this.models.remove(commands[name].parse(value).id);
      case 'models.default': return this.models.setDefault(commands[name].parse(value).id);
      case 'models.discover': return this.models.discover(commands[name].parse(value).id);
      case 'models.test': return this.models.test(commands[name].parse(value).id);
      case 'models.analyze': { const p = commands[name].parse(value); return this.models.analyze(p.projectId, p.signalIds); }
      case 'jobs.list': return this.models.jobs.list(commands[name].parse(value).projectId);
      case 'jobs.cancel': return this.models.jobs.cancel(commands[name].parse(value).id);
      case 'projects.list': return this.database.list();
      case 'projects.create': { const p = commands[name].parse(value); return this.database.create(p.name, p.mode); }
      case 'projects.load': return this.database.load(commands[name].parse(value).id);
      case 'projects.save': { const p = commands[name].parse(value); return this.database.save(p.id, p.revision, p.data); }
      case 'projects.import': { const p = commands[name].parse(value); return this.database.import(p.name, p.snapshot); }
      case 'projects.backup': return this.database.backup();
      case 'projects.resetDemo': return this.database.resetDemo(commands[name].parse(value).id);
    }
  }
}
