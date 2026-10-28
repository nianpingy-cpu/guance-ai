import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import { access, mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

// Contract checks use a disposable profile and an existing build. No credentials,
// model/collection/sync requests, user files, or real external endpoints are used.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = join(root, 'docs', 'desktop', 'boundary-results.json');
const profile = await mkdtemp(join(tmpdir(), 'guance-boundary-'));
const executable = process.env.GUANCE_EXECUTABLE ? resolve(process.env.GUANCE_EXECUTABLE) : createRequire(import.meta.url)('electron');
const reservedOrigin = 'https://guance-boundary.invalid';
const checks = ['renderer-node-disabled', 'context-isolation', 'csp-inline-script', 'csp-fetch', 'renderer-navigation', 'popup-policy', 'notification-permission', 'other-window-ipc'];
const report = {
  at: new Date().toISOString(), platform: process.platform, node: process.version,
  mode: process.env.GUANCE_EXECUTABLE ? 'installed-executable' : 'source-electron-existing-build',
  executable, profile, status: 'running',
  scope: '隔离测试应用的正常边界契约；不代表完整安全审计或真实外部网络验收。',
  isolation: { independentGuanceTestData: true, userFilesRead: false, userCredentialsRead: false, modelRequests: 0, collectionRequests: 0, syncRequests: 0, realExternalServicesUsed: false },
  checks: checks.map(id => ({ id, status: 'not-run' })),
};
let app;
let page;
let mainId;

async function check(id, action) {
  const item = report.checks.find(item => item.id === id);
  item.startedAt = new Date().toISOString();
  try {
    const evidence = await action();
    item.evidence = evidence;
    item.status = evidence?.supported === false ? 'unsupported' : 'passed';
  } catch (error) {
    item.status = 'failed'; item.error = error instanceof Error ? error.stack : String(error);
  }
  item.finishedAt = new Date().toISOString();
}
async function mainState() {
  return app.evaluate(() => {
    const state = globalThis.__guanceBoundaryContract;
    return { externalCalls: state.externalCalls, navigation: state.navigation, networkGuard: state.networkGuard, createdWindows: state.createdWindows };
  });
}
async function untilMain(predicate) {
  let state;
  for (let attempt = 0; attempt < 30; attempt++) { state = await mainState(); if (predicate(state)) return state; await delay(50); }
  return state;
}

await mkdir(dirname(output), { recursive: true });
try {
  await access(executable);
  if (!process.env.GUANCE_EXECUTABLE) for (const path of ['dist/index.html', 'desktop-dist/main.cjs', 'desktop-dist/worker.cjs', 'desktop-dist/preload.cjs']) await access(join(root, path));
  const env = { ...process.env, GUANCE_TEST_DATA: profile };
  delete env.GUANCE_DEV_URL; delete env.ELECTRON_RUN_AS_NODE;
  app = await electron.launch({ executablePath: executable, args: process.env.GUANCE_EXECUTABLE ? [] : ['.'], cwd: root, env, timeout: 30000 });
  const metadata = await app.evaluate(({ app }) => ({ version: app.getVersion(), isPackaged: app.isPackaged, appPath: app.getAppPath(), electron: process.versions.electron, chrome: process.versions.chrome, userData: app.getPath('userData') }));
  assert.equal(resolve(metadata.userData), resolve(profile), '必须使用本轮新建的临时应用目录');
  report.application = metadata;
  page = await app.firstWindow({ timeout: 20000 });
  await page.getByRole('button', { name: '设置', exact: true }).waitFor();
  const baseline = await app.evaluate(({ app, BrowserWindow, shell }, origin) => {
    const main = BrowserWindow.getAllWindows().find(window => window.webContents.getURL().startsWith('guance://app/'));
    if (!main) throw new Error('未找到使用正式自定义协议的测试主窗口');
    const state = { mainId: main.id, originalOpenExternal: shell.openExternal, shellDescriptor: Object.getOwnPropertyDescriptor(shell, 'openExternal'), externalCalls: [], navigation: [], networkGuard: [], createdWindows: [], secondary: null };
    globalThis.__guanceBoundaryContract = state;
    state.observeNavigation = (event, target) => {
      const url = typeof target === 'string' ? target : target?.url;
      if (url?.startsWith(origin + '/')) state.navigation.push({ url, defaultPrevented: event.defaultPrevented });
    };
    state.observeWindow = window => state.createdWindows.push(window.id);
    main.webContents.on('will-navigate', state.observeNavigation);
    app.on('browser-window-created', state.observeWindow);
    // A failed product check must still be unable to contact an external host.
    // This guard records fallback cancellation; it cannot make a CSP/navigation
    // check pass, since those require their own enforcement events below.
    main.webContents.session.webRequest.onBeforeRequest({ urls: [origin + '/*'] }, (details, callback) => { state.networkGuard.push({ url: details.url, method: details.method }); callback({ cancel: true }); });
    const recorder = async url => { state.externalCalls.push(String(url)); };
    Object.defineProperty(shell, 'openExternal', { value: recorder, configurable: true, writable: true });
    if (shell.openExternal !== recorder) throw new Error('无法替换测试应用的外链记录器，不能执行弹窗检查');
    return { mainId: main.id, initialWindows: BrowserWindow.getAllWindows().map(window => window.id), preferences: main.webContents.getLastWebPreferences(), externalRecorderInstalled: true, fallbackRequestGuardInstalled: true };
  }, reservedOrigin);
  mainId = baseline.mainId; report.baseline = baseline;
  report.fixture = await page.evaluate(() => window.guance.invoke('projects.create', { name: '桌面边界契约验收（虚构项目）', mode: 'real' })).then(project => ({ id: project.id, name: project.name, mode: project.mode }));

  await check('renderer-node-disabled', async () => {
    const globals = await page.evaluate(() => ({ require: typeof window.require, process: typeof window.process, Buffer: typeof window.Buffer, module: typeof window.module, bridge: window.guance?.desktop === true }));
    assert.deepEqual(globals, { require: 'undefined', process: 'undefined', Buffer: 'undefined', module: 'undefined', bridge: true });
    const { nodeIntegration, sandbox, webSecurity } = baseline.preferences;
    assert.equal(nodeIntegration, false); assert.equal(sandbox, true); assert.equal(webSecurity, true);
    return { globals, preferences: { nodeIntegration, sandbox, webSecurity } };
  });
  await check('context-isolation', async () => {
    assert.equal(baseline.preferences.contextIsolation, true);
    await page.evaluate(() => { window.__guanceBoundaryMainWorld = 'main-world-marker'; });
    const isolated = await app.evaluate(async ({ BrowserWindow }, id) => {
      const contents = BrowserWindow.fromId(id).webContents;
      if (typeof contents.executeJavaScriptInIsolatedWorld !== 'function') return { supported: false, reason: '当前Electron未提供executeJavaScriptInIsolatedWorld', contextIsolation: true };
      const mainMarker = await contents.executeJavaScriptInIsolatedWorld(999, [{ code: 'typeof globalThis.__guanceBoundaryMainWorld' }]);
      await contents.executeJavaScriptInIsolatedWorld(999, [{ code: 'globalThis.__guanceBoundaryIsolatedWorld = "isolated-world-marker"' }]);
      return { mainMarker, worldId: 999 };
    }, mainId);
    if (isolated.supported === false) return isolated;
    const isolatedMarkerInMain = await page.evaluate(() => typeof window.__guanceBoundaryIsolatedWorld);
    assert.equal(isolated.mainMarker, 'undefined'); assert.equal(isolatedMarkerInMain, 'undefined');
    return { contextIsolation: true, ...isolated, isolatedMarkerInMain };
  });
  await check('csp-inline-script', async () => {
    const evidence = await page.evaluate(async () => {
      if (typeof SecurityPolicyViolationEvent === 'undefined') return { supported: false, reason: '当前浏览器没有SecurityPolicyViolationEvent' };
      delete window.__guanceBoundaryInlineRan;
      const events = []; let listener;
      const enforced = new Promise(resolve => {
        listener = event => {
          if (event.blockedURI === 'inline' && event.effectiveDirective.startsWith('script-src')) { events.push({ blockedURI: event.blockedURI, effectiveDirective: event.effectiveDirective, disposition: event.disposition, originalPolicy: event.originalPolicy }); resolve(true); }
        };
        document.addEventListener('securitypolicyviolation', listener);
      });
      const script = document.createElement('script'); script.textContent = 'window.__guanceBoundaryInlineRan = true;'; document.head.append(script);
      let timer;
      try { await Promise.race([enforced, new Promise(resolve => { timer = setTimeout(resolve, 2000); })]); return { events, markerExecuted: window.__guanceBoundaryInlineRan === true }; }
      finally { window.clearTimeout(timer); document.removeEventListener('securitypolicyviolation', listener); script.remove(); delete window.__guanceBoundaryInlineRan; }
    });
    if (evidence.supported === false) return evidence;
    assert.equal(evidence.markerExecuted, false); assert.ok(evidence.events.some(event => event.disposition === 'enforce'), '必须收到脚本CSP强制拦截事件');
    return evidence;
  });
  await check('csp-fetch', async () => {
    const evidence = await page.evaluate(async origin => {
      if (typeof SecurityPolicyViolationEvent === 'undefined') return { supported: false, reason: '当前浏览器没有SecurityPolicyViolationEvent' };
      const events = []; let listener;
      const enforced = new Promise(resolve => {
        listener = event => {
          if (event.effectiveDirective === 'connect-src' && event.blockedURI.startsWith(origin)) { events.push({ blockedURI: event.blockedURI, effectiveDirective: event.effectiveDirective, disposition: event.disposition, originalPolicy: event.originalPolicy }); resolve(true); }
        };
        document.addEventListener('securitypolicyviolation', listener);
      });
      let timer; let fetchOutcome;
      try {
        const request = window.fetch(origin + '/csp-probe', { method: 'GET', credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store' }).then(() => { fetchOutcome = 'resolved'; }, error => { fetchOutcome = error.name; });
        await Promise.race([Promise.all([enforced, request]), new Promise(resolve => { timer = setTimeout(resolve, 2000); })]);
        return { events, fetchOutcome };
      } finally { window.clearTimeout(timer); document.removeEventListener('securitypolicyviolation', listener); }
    }, reservedOrigin);
    if (evidence.supported === false) return evidence;
    assert.ok(evidence.events.some(event => event.disposition === 'enforce'), '网络错误不能替代connect-src的CSP强制拦截事件');
    const fallbackRequests = (await mainState()).networkGuard.filter(request => request.url.endsWith('/csp-probe'));
    assert.equal(fallbackRequests.length, 0, 'CSP应在请求进入兜底取消器之前拦截');
    return { ...evidence, fallbackRequests };
  });
  await check('renderer-navigation', async () => {
    const before = page.url(); const target = reservedOrigin + '/navigation-probe';
    await page.evaluate(url => { window.location.href = url; }, target);
    const state = await untilMain(state => state.navigation.some(event => event.url === target));
    const event = state.navigation.find(event => event.url === target);
    assert.ok(event, '必须记录页面发起的will-navigate'); assert.equal(event.defaultPrevented, true); assert.equal(page.url(), before);
    const fallbackRequests = state.networkGuard.filter(request => request.url === target);
    assert.equal(fallbackRequests.length, 0, '导航应被应用导航规则拦截');
    return { target, before, after: page.url(), event, fallbackRequests };
  });
  await check('popup-policy', async () => {
    const target = reservedOrigin + '/popup-probe';
    const returnedNull = await page.evaluate(url => window.open(url, '_blank') === null, target);
    const state = await untilMain(state => state.externalCalls.includes(target));
    const windows = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().map(window => window.id));
    assert.equal(returnedNull, true); assert.deepEqual(windows, baseline.initialWindows); assert.deepEqual(state.createdWindows, []); assert.deepEqual(state.externalCalls, [target]);
    return { target, returnedNull, windows, createdWindows: state.createdWindows, recordedExternalCalls: state.externalCalls, realBrowserOpened: false };
  });
  await check('notification-permission', async () => {
    const evidence = await page.evaluate(async () => {
      if (typeof window.Notification !== 'function' || typeof window.Notification.requestPermission !== 'function') return { supported: false, reason: '当前平台未提供Notification.requestPermission' };
      let timer;
      try { return { supported: true, result: await Promise.race([window.Notification.requestPermission(), new Promise(resolve => { timer = setTimeout(() => resolve('timed-out'), 3000); })]) }; }
      finally { window.clearTimeout(timer); }
    });
    if (evidence.supported === false) return evidence;
    assert.equal(evidence.result, 'denied'); return evidence;
  });
  await check('other-window-ipc', async () => {
    // main.ts constructs its preload at this exact app-relative path in source
    // and packaged apps. Electron 45's getLastWebPreferences omits that path.
    const sharedPreload = join(metadata.appPath, 'desktop-dist', 'preload.cjs');
    const evidence = await app.evaluate(async ({ BrowserWindow }, { id, sharedPreload }) => {
      const main = BrowserWindow.fromId(id); const preferences = main.webContents.getLastWebPreferences();
      if (preferences.preload && preferences.preload !== sharedPreload) throw new Error('主窗口preload路径与应用启动契约不同');
      const other = new BrowserWindow({ show: false, width: 800, height: 600, webPreferences: { preload: sharedPreload, contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true } });
      globalThis.__guanceBoundaryContract.secondary = other;
      const otherId = other.id;
      try {
        await other.loadURL('guance://app/dashboard');
        const outcome = await other.webContents.executeJavaScript('window.guance.invoke("projects.list", undefined).then(() => ({ allowed: true }), error => ({ allowed: false, error: error.message }))');
        const bridgeAvailable = await other.webContents.executeJavaScript('window.guance?.desktop === true');
        return { mainId: id, otherId, hidden: !other.isVisible(), sharedPreload, preloadSource: 'main.ts应用目录/desktop-dist/preload.cjs', bridgeAvailable, url: other.webContents.getURL(), ...outcome };
      } finally { other.destroy(); globalThis.__guanceBoundaryContract.secondary = null; }
    }, { id: mainId, sharedPreload });
    assert.notEqual(evidence.otherId, evidence.mainId); assert.equal(evidence.hidden, true); assert.equal(evidence.bridgeAvailable, true); assert.equal(evidence.sharedPreload, sharedPreload); assert.equal(evidence.allowed, false); assert.match(evidence.error, /无权访问本地服务/);
    const windowsAfter = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().map(window => window.id));
    assert.deepEqual(windowsAfter, baseline.initialWindows);
    return { ...evidence, secondaryDestroyed: true, windowsAfter };
  });
  report.networkGuard = (await mainState()).networkGuard;
} catch (error) {
  report.error = error instanceof Error ? error.stack : String(error);
} finally {
  if (app) {
    try {
      report.cleanup = await app.evaluate(({ app, BrowserWindow, shell }) => {
        const state = globalThis.__guanceBoundaryContract;
        if (!state) return { testHooksInstalled: false };
        if (state.secondary && !state.secondary.isDestroyed()) state.secondary.destroy();
        const main = BrowserWindow.fromId(state.mainId);
        if (main && !main.isDestroyed()) { main.webContents.removeListener('will-navigate', state.observeNavigation); main.webContents.session.webRequest.onBeforeRequest(null); }
        app.removeListener('browser-window-created', state.observeWindow);
        if (state.shellDescriptor) Object.defineProperty(shell, 'openExternal', state.shellDescriptor); else shell.openExternal = state.originalOpenExternal;
        const restored = shell.openExternal === state.originalOpenExternal;
        delete globalThis.__guanceBoundaryContract;
        return { externalOpenerRestored: restored, secondaryWindowDestroyed: !state.secondary || state.secondary.isDestroyed(), networkGuardRemoved: true, testListenersRemoved: true };
      });
      assert.notEqual(report.cleanup.externalOpenerRestored, false);
    } catch (error) { report.cleanupError = error instanceof Error ? error.stack : String(error); }
    try { await app.close(); report.applicationClosed = true; } catch (error) { report.closeError = String(error); }
  }
  const failed = report.error || report.cleanupError || report.closeError || report.checks.some(item => item.status === 'failed');
  report.status = failed ? 'failed' : report.checks.every(item => item.status === 'passed') ? 'passed' : 'incomplete';
  report.finishedAt = new Date().toISOString();
  await writeFile(output, JSON.stringify(report, null, 2) + '\n');
}
console.log(JSON.stringify({ status: report.status, mode: report.mode, version: report.application?.version, checks: report.checks.map(({ id, status }) => ({ id, status })), output }, null, 2));
if (report.status !== 'passed') process.exitCode = report.status === 'failed' ? 1 : 2;
