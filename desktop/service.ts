import { z } from 'zod';
import type { Command } from '../src/types/desktop';
import { LocalDatabase } from './database';

const id = z.string().min(1).max(200);
export const commands = {
  'projects.list': z.undefined(),
  'projects.create': z.object({ name: id, mode: z.enum(['demo', 'real']) }).strict(),
  'projects.load': z.object({ id }).strict(),
  'projects.save': z.object({ id, revision: id, data: z.unknown() }).strict(),
  'projects.import': z.object({ name: id, snapshot: z.unknown() }).strict(),
  'projects.backup': z.undefined(),
  'projects.resetDemo': z.object({ id }).strict(),
};
export class DesktopService {
  constructor(readonly database: LocalDatabase) {}
  async execute(command: string, input: unknown): Promise<unknown> {
    if (!Object.hasOwn(commands, command)) throw new Error('不支持的操作');
    const name = command as Command;
    const value = commands[name].parse(input);
    switch (name) {
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
