import type { AppData } from './domain';

export interface ProjectSummary { id: string; name: string; revision: string; mode: 'demo' | 'real'; updatedAt: string }
export interface Project extends ProjectSummary { data: AppData }
export type ModelProtocol = 'chat' | 'responses' | 'anthropic';
export interface Provider { id: string; name: string; baseUrl: string; protocol: ModelProtocol; models: string[]; model: string; hasKey: boolean }
export type ProviderInput = Omit<Provider, 'id' | 'hasKey'> & { id?: string; apiKey?: string };
export interface Job { id: string; projectId: string; kind: 'analysis' | 'collect'; status: 'running' | 'completed' | 'failed' | 'cancelled' | 'interrupted'; progress: string; createdAt: string; error?: string; result?: string }
export type Platform = 'wechat' | 'xiaohongshu' | 'douyin';
export interface Connection { id: string; name: string; status: string; link: string; description: string; appId: string; hasSecret: boolean }
export interface DesktopCommands {
  'collect.start': { input: { projectId: string; kind: 'web' | 'rss' | Platform; url: string; triggerTaskId?: string }; output: Job };
  'collect.retry': { input: { id: string }; output: Job };
  'connections.list': { input: undefined; output: Connection[] };
  'connections.save': { input: { platform: Platform; appId: string; secret?: string }; output: void };
  'connections.remove': { input: { platform: Platform }; output: void };
  'models.list': { input: undefined; output: { providers: Provider[]; defaultId: string } };
  'models.save': { input: ProviderInput; output: Provider };
  'models.remove': { input: { id: string }; output: void };
  'models.default': { input: { id: string }; output: void };
  'models.discover': { input: { id: string }; output: string[] };
  'models.test': { input: { id: string }; output: string };
  'models.analyze': { input: { projectId: string; signalIds: string[] }; output: Job };
  'jobs.list': { input: { projectId: string }; output: Job[] };
  'jobs.cancel': { input: { id: string }; output: void };
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
