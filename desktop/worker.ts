import { LocalDatabase } from './database';
import { DesktopService } from './service';

let service: DesktopService;
const parentPort = process.parentPort;
parentPort?.on('message', async (event: Electron.MessageEvent) => {
  const message = event.data as { id: number; command: string; input: unknown; directory?: string };
  try {
    if (message.command === 'initialize') {
      if (!message.directory) throw new Error('未设置数据目录');
      const db = new LocalDatabase(message.directory);
      if (!db.list().length) db.create('齐鲁茶研 · 演示项目', 'demo');
      service = new DesktopService(db);
      parentPort?.postMessage({ id: message.id, result: true }); return;
    }
    if (!service) throw new Error('本地服务尚未就绪');
    parentPort?.postMessage({ id: message.id, result: await service.execute(message.command, message.input) });
  } catch (error) { parentPort?.postMessage({ id: message.id, error: error instanceof Error ? error.message : '操作失败' }); }
});
