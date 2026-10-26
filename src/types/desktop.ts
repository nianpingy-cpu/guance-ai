import type { AppData } from './domain';

export interface ProjectSummary { id: string; name: string; revision: string; mode: 'demo' | 'real'; updatedAt: string }
export interface Project extends ProjectSummary { data: AppData }
export interface DesktopCommands {
  'projects.list': { input: undefined; output: ProjectSummary[] };
  'projects.create': { input: { name: string; mode: 'demo' | 'real' }; output: Project };
  'projects.load': { input: { id: string }; output: Project };
  'projects.save': { input: { id: string; revision: string; data: AppData }; output: Project };
  'projects.import': { input: { name: string; snapshot: unknown }; output: Project };
  'projects.backup': { input: undefined; output: { filename: string } };
  'projects.resetDemo': { input: { id: string }; output: Project };
}
export type Command = keyof DesktopCommands;
export interface GuanceBridge {
  readonly desktop: true;
  onBeforeClose(callback: () => Promise<void>): void;
  invoke<K extends Command>(command: K, input: DesktopCommands[K]['input']): Promise<DesktopCommands[K]['output']>;
}
declare global { interface Window { guance?: GuanceBridge } }
