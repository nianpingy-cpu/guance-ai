import { app, BrowserWindow, ipcMain, protocol, net, shell, safeStorage, utilityProcess } from 'electron';
import { join, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { existsSync } from 'node:fs';
import { Buffer } from 'node:buffer';

protocol.registerSchemesAsPrivileged([{ scheme: 'guance', privileges: { standard: true, secure: true, supportFetchAPI: true } }]);
app.setName('GuanceAI');
app.setPath('userData', join(app.getPath('appData'), 'GuanceAI'));
if (process.env.GUANCE_TEST_DATA) app.setPath('userData', resolve(process.env.GUANCE_TEST_DATA));
const primary = app.requestSingleInstanceLock();
if (!primary) app.quit();
const development = !app.isPackaged && process.env.GUANCE_DEV_URL;
let mainWindow: BrowserWindow;
let worker: Electron.UtilityProcess;
let nextId = 0;
const pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();
function request(command: string, input?: unknown): Promise<unknown> {
  return new Promise((resolve, reject) => { const id = ++nextId; pending.set(id, { resolve, reject }); worker.postMessage({ id, command, input, directory: join(app.getPath('userData'), 'data') }); });
}
app.on('second-instance', () => { if (mainWindow) { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.show(); mainWindow.focus(); } });
if (primary) app.whenReady().then(async () => {
  const client = resolve(__dirname, '../dist');
  protocol.handle('guance', async (request) => {
    const url = new URL(request.url);
    if (url.host !== 'app') return new Response('Forbidden', { status: 403 });
    let target = resolve(client, '.' + decodeURIComponent(url.pathname));
    if (!target.startsWith(client + sep)) target = join(client, 'index.html');
    if (!existsSync(target) || !target.includes('.')) target = join(client, 'index.html');
    const response = await net.fetch(pathToFileURL(target).href);
    const headers = new Headers(response.headers);
    headers.set('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'none'; object-src 'none'; frame-src 'none'; base-uri 'self'; form-action 'none'");
    return new Response(response.body, { status: response.status, headers });
  });
  worker = utilityProcess.fork(join(__dirname, 'worker.cjs'));
  worker.on('message', async (message: { id: number; result?: unknown; error?: string; secureId?: number; method?: string; value?: string }) => {
    if (message.secureId) {
      try {
        if (!await safeStorage.isAsyncEncryptionAvailable()) throw new Error('系统安全存储不可用，不能保存密钥');
        if (typeof message.value !== 'string') throw new Error('凭据格式无效');
        const value = message.method === 'encrypt' ? (await safeStorage.encryptStringAsync(message.value)).toString('base64') : (await safeStorage.decryptStringAsync(Buffer.from(message.value, 'base64'))).result;
        worker.postMessage({ secureId: message.secureId, value });
      } catch { worker.postMessage({ secureId: message.secureId, error: '系统密钥存储不可用或凭据无法解密，请在本机重新配置' }); }
      return;
    }
    const listener = pending.get(message.id); if (!listener) return; pending.delete(message.id);
    if (message.error) listener.reject(new Error(message.error)); else listener.resolve(message.result);
  });
  worker.on('error', (error) => { for (const p of pending.values()) p.reject(new Error(String(error))); pending.clear(); });
  worker.on('exit', () => { for (const p of pending.values()) p.reject(new Error('本地服务已停止，请重新启动应用')); pending.clear(); });
  await request('initialize');
  ipcMain.handle('guance:request', async (event, message: { command: string; input: unknown }) => {
    const url = event.senderFrame?.url ?? '';
    const expected = development ? new URL(development).origin : 'guance://app';
    if (event.sender.id !== mainWindow.webContents.id || !(url === expected || url.startsWith(expected + '/'))) throw new Error('无权访问本地服务');
    if (!message || typeof message.command !== 'string' || JSON.stringify(message).length > 20_000_000) throw new Error('请求格式无效或过大');
    return request(message.command, message.input);
  });
  mainWindow = new BrowserWindow({ width: 1440, height: 960, minWidth: 1024, minHeight: 700, title: '观策AI', icon: join(client, 'icon.png'), backgroundColor: '#f5f7fa', webPreferences: { preload: join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true } });
  let closeReady = false;
  mainWindow.on('close', (event) => { if (!closeReady) { event.preventDefault(); mainWindow.webContents.send('guance:before-close'); } });
  ipcMain.on('guance:close-ready', (event) => { if (event.sender.id === mainWindow.webContents.id) { closeReady = true; mainWindow.close(); } });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => { if (/^https:\/\//.test(url)) void shell.openExternal(url); return { action: 'deny' }; });
  mainWindow.webContents.on('will-navigate', (event, url) => { const allowed = development ? new URL(development).origin : 'guance://app'; if (!(url === allowed || url.startsWith(allowed + '/'))) event.preventDefault(); });
  mainWindow.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  await mainWindow.loadURL(development || 'guance://app/dashboard');
  if (!await safeStorage.isAsyncEncryptionAvailable()) mainWindow.webContents.send('guance:storage-unavailable');
}).catch((error) => { console.error('Desktop startup failed:', error instanceof Error ? error.message : 'unknown'); app.exit(1); });
app.on('window-all-closed', () => { worker?.kill(); app.quit(); });
