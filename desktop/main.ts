import { app, BrowserWindow, ipcMain, protocol, net, shell, safeStorage, session, utilityProcess } from 'electron';
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
let workerExited = false;
let workerStopping = false;
let nextId = 0;
const pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();

type PlatformId = 'wechat' | 'xiaohongshu' | 'douyin';
const platformIds = new Set<PlatformId>(['wechat', 'xiaohongshu', 'douyin']);
const platformLabels: Record<PlatformId, string> = { wechat: '微信公众号', xiaohongshu: '小红书', douyin: '抖音' };
const platformStartUrls: Record<PlatformId, string> = {
  wechat: 'https://mp.weixin.qq.com/',
  xiaohongshu: 'https://www.xiaohongshu.com/explore',
  douyin: 'https://www.douyin.com/',
};
const platformHosts: Record<PlatformId, string[]> = {
  wechat: ['mp.weixin.qq.com'],
  xiaohongshu: ['xiaohongshu.com', 'xhslink.com'],
  douyin: ['douyin.com', 'iesdouyin.com'],
};
const platformWindows = new Map<PlatformId, BrowserWindow>();

function isPlatformUrl(platform: PlatformId, value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password) return false;
    return platformHosts[platform].some((host) => url.hostname === host || url.hostname.endsWith('.' + host));
  } catch { return false; }
}

function platformCaptureScript(platform: PlatformId, scrolls: number, maxItems: number) {
  return `(async () => {
    const platform = ${JSON.stringify(platform)};
    const maxItems = ${maxItems};
    const scrollSteps = ${scrolls};
    const clean = (value) => String(value || '').replace(/\\s+/g, ' ').trim();
    const meta = (name) => {
      const node = document.querySelector('meta[property="' + name + '"], meta[name="' + name + '"]');
      return node ? (node.getAttribute('content') || '') : '';
    };
    const absolute = (value) => {
      try {
        const url = new URL(value, location.href);
        return (url.protocol === 'https:' || url.protocol === 'http:') ? url.href : '';
      } catch { return ''; }
    };
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const blocked = () => /环境异常|访问过于频繁|验证码|安全验证|captcha|请完成验证/i.test(document.body?.innerText || '');
    const result = [];
    const seen = new Set();
    const add = (title, url, content) => {
      const cleanUrl = absolute(url);
      const cleanTitle = clean(title).slice(0, 2000);
      const cleanContent = clean(content).slice(0, 200000);
      if (!cleanUrl || !cleanTitle || !cleanContent || seen.has(cleanUrl) || result.length >= maxItems) return;
      seen.add(cleanUrl);
      result.push({ title: cleanTitle, url: cleanUrl, content: cleanContent, platform: platform === 'wechat' ? '微信公众号' : platform === 'xiaohongshu' ? '小红书' : '抖音' });
    };
    const collectSearchLinks = () => {
      if (platform === 'xiaohongshu') {
        for (const anchor of document.querySelectorAll('a[href*="/explore/"], a[href*="/discovery/item/"]')) {
          add(anchor.getAttribute('title') || anchor.textContent || '', anchor.getAttribute('href') || '', anchor.getAttribute('title') || anchor.textContent || '');
          if (result.length >= maxItems) break;
        }
      } else if (platform === 'douyin') {
        for (const anchor of document.querySelectorAll('a[href*="/video/"]')) {
          add(anchor.getAttribute('title') || anchor.textContent || '', anchor.getAttribute('href') || '', anchor.getAttribute('title') || anchor.textContent || '');
          if (result.length >= maxItems) break;
        }
      }
    };
    if (platform === 'wechat') {
      const body = clean(document.querySelector('#js_content')?.innerText || '');
      if (body) add(document.querySelector('#activity-name')?.textContent || meta('og:title') || document.title, location.href, body);
    } else if (platform === 'xiaohongshu') {
      const detail = /\\/explore\\//.test(location.pathname) || /\\/discovery\\/item\\//.test(location.pathname);
      const searchPage = /\\/search_result\\//.test(location.pathname) || location.search.includes('keyword=');
      if (detail) {
        const body = clean(document.querySelector('#detail-desc')?.innerText || document.querySelector('.note-content')?.innerText || meta('description') || '');
        if (body) add(document.querySelector('#detail-title')?.textContent || meta('og:title') || document.title, location.href, body);
      } else if (searchPage) {
        collectSearchLinks();
      }
    } else if (platform === 'douyin') {
      const detail = /\\/video\\//.test(location.pathname) || new URL(location.href).searchParams.has('modal_id');
      const searchPage = /\\/search\\//.test(location.pathname) || location.search.includes('keyword=');
      if (detail) {
        const body = clean(document.querySelector('[data-e2e="video-desc"]')?.innerText || meta('description') || '');
        if (body) add(meta('og:title') || document.title, location.href, body);
      } else if (searchPage) {
        collectSearchLinks();
      }
    }
    if (scrollSteps > 0 && result.length < maxItems && (platform === 'xiaohongshu' || platform === 'douyin')) {
      for (let index = 0; index < scrollSteps; index++) {
        if (blocked()) throw new Error('页面出现平台验证，请手动完成后重试');
        const before = result.length;
        window.scrollTo(0, document.documentElement.scrollHeight);
        await sleep(1400 + Math.floor(Math.random() * 700));
        collectSearchLinks();
        if (result.length >= maxItems) break;
        if (result.length === before) {
          await sleep(800);
          collectSearchLinks();
          if (result.length === before) break;
        }
      }
    }
    if (blocked() && result.length === 0) throw new Error('页面出现平台验证，请手动完成后重试');
    return result.slice(0, maxItems);
  })()`;
}

async function openPlatformWindow(platform: PlatformId, requestedUrl?: string) {
  if (!mainWindow) throw new Error('应用窗口尚未就绪');
  if (requestedUrl && !isPlatformUrl(platform, requestedUrl)) throw new Error('链接不属于该平台，未打开');
  let win = platformWindows.get(platform);
  if (win && !win.isDestroyed()) {
    win.show(); win.focus();
    if (requestedUrl) await win.loadURL(requestedUrl);
    return;
  }
  const partition = `persist:guance-${platform}`;
  const platformSession = session.fromPartition(partition);
  platformSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  win = new BrowserWindow({
    width: 1180, height: 860, parent: mainWindow, autoHideMenuBar: true,
    title: `${platformLabels[platform]} · 登录窗口`, backgroundColor: '#ffffff',
    webPreferences: { partition, contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true },
  });
  win.webContents.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36');
  win.webContents.on('will-navigate', (event, url) => { if (!/^https:\/\//.test(url)) event.preventDefault(); });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (!/^https:\/\//.test(url)) return { action: 'deny' };
    return { action: 'allow', overrideBrowserWindowOptions: { parent: win, autoHideMenuBar: true, webPreferences: { partition, contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true } } };
  });
  win.on('closed', () => platformWindows.delete(platform));
  platformWindows.set(platform, win);
  await win.loadURL(requestedUrl || platformStartUrls[platform]);
}

async function capturePlatformWindow(platform: PlatformId, options?: { scrolls?: number; maxItems?: number }) {
  const win = platformWindows.get(platform);
  if (!win || win.isDestroyed()) throw new Error('请先打开对应平台的登录窗口，并在窗口中打开一篇内容');
  const scrolls = Math.max(0, Math.min(10, Math.floor(options?.scrolls ?? 0)));
  const maxItems = Math.max(1, Math.min(50, Math.floor(options?.maxItems ?? 20)));
  const raw = await win.webContents.executeJavaScriptInIsolatedWorld(999, [{ code: platformCaptureScript(platform, scrolls, maxItems) }], true);
  if (!Array.isArray(raw)) throw new Error('页面内容格式不支持');
  return raw.slice(0, maxItems).flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const title = typeof item.title === 'string' ? item.title.trim().slice(0, 2000) : '';
    const url = typeof item.url === 'string' ? item.url.trim().slice(0, 2000) : '';
    const content = typeof item.content === 'string' ? item.content.trim().slice(0, 200000) : '';
    const itemPlatform = typeof item.platform === 'string' ? item.platform.slice(0, 50) : platformLabels[platform];
    if (!title || !content || !isPlatformUrl(platform, url)) return [];
    return [{ title, url, content, platform: itemPlatform }];
  });
}

async function clearPlatformWindow(platform: PlatformId) {
  const win = platformWindows.get(platform);
  if (win && !win.isDestroyed()) win.destroy();
  platformWindows.delete(platform);
  const platformSession = session.fromPartition(`persist:guance-${platform}`);
  await platformSession.clearStorageData();
  await platformSession.clearCache();
}
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
  worker.on('exit', () => { workerExited = true; for (const p of pending.values()) p.reject(new Error('本地服务已停止，请重新启动应用')); pending.clear(); });
  await request('initialize');
  ipcMain.handle('guance:request', async (event, message: { command: string; input: unknown }) => {
    const url = event.senderFrame?.url ?? '';
    const expected = development ? new URL(development).origin : 'guance://app';
    if (event.sender.id !== mainWindow.webContents.id || !(url === expected || url.startsWith(expected + '/'))) throw new Error('无权访问本地服务');
    if (!message || typeof message.command !== 'string' || JSON.stringify(message).length > 20_000_000) throw new Error('请求格式无效或过大');
    if (message.command === 'initialize') throw new Error('不支持的操作');
    return request(message.command, message.input);
  });
  mainWindow = new BrowserWindow({ width: 1440, height: 960, minWidth: 1024, minHeight: 700, title: '观策AI', icon: join(client, 'icon.png'), backgroundColor: '#f5f7fa', webPreferences: { preload: join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true } });
  ipcMain.handle('guance:platform', async (event, message: { action?: string; platform?: string; url?: string; options?: { scrolls?: number; maxItems?: number } }) => {
    const url = event.senderFrame?.url ?? '';
    const expected = development ? new URL(development).origin : 'guance://app';
    if (event.sender.id !== mainWindow.webContents.id || !(url === expected || url.startsWith(expected + '/'))) throw new Error('无权访问平台窗口');
    if (!message || !platformIds.has(message.platform as PlatformId)) throw new Error('不支持的平台');
    const platform = message.platform as PlatformId;
    if (message.action === 'open') return openPlatformWindow(platform, typeof message.url === 'string' ? message.url : undefined);
    if (message.action === 'capture') return capturePlatformWindow(platform, message.options);
    if (message.action === 'close') { const win = platformWindows.get(platform); if (win && !win.isDestroyed()) win.close(); return; }
    if (message.action === 'clear') return clearPlatformWindow(platform);
    throw new Error('不支持的平台操作');
  });
  let closeReady = false;
  mainWindow.on('close', (event) => { if (!closeReady) { event.preventDefault(); mainWindow.webContents.send('guance:before-close'); } });
  mainWindow.on('closed', () => { for (const win of platformWindows.values()) if (!win.isDestroyed()) win.destroy(); platformWindows.clear(); });
  ipcMain.on('guance:close-ready', (event) => { if (event.sender.id === mainWindow.webContents.id) { closeReady = true; mainWindow.close(); } });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => { if (/^https:\/\//.test(url)) void shell.openExternal(url); return { action: 'deny' }; });
  mainWindow.webContents.on('will-navigate', (event, url) => { const allowed = development ? new URL(development).origin : 'guance://app'; if (!(url === allowed || url.startsWith(allowed + '/'))) event.preventDefault(); });
  mainWindow.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  await mainWindow.loadURL(development || 'guance://app/dashboard');
  if (!await safeStorage.isAsyncEncryptionAvailable()) mainWindow.webContents.send('guance:storage-unavailable');
}).catch((error) => { console.error('Desktop startup failed:', error instanceof Error ? error.message : 'unknown'); app.exit(1); });
app.on('window-all-closed', () => app.quit());
app.on('will-quit', (event) => {
  if (!worker || workerExited) return;
  event.preventDefault();
  if (workerStopping) return;
  workerStopping = true;
  // Keep the profile's single-instance lock until SQLite's owning process exits.
  worker.once('exit', () => app.quit());
  if (!worker.kill()) app.quit();
});
