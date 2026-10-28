import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { access, mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { tmpdir, cpus, totalmem, freemem, arch, release } from 'node:os';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { Buffer } from 'node:buffer';
import { performance } from 'node:perf_hooks';
import { setTimeout as delay } from 'node:timers/promises';
import { createDecipheriv, pbkdf2Sync } from 'node:crypto';

// This script intentionally does not build. Run only after the desired desktop
// build is ready, or set GUANCE_EXECUTABLE to the exact installed executable.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = join(root, 'docs', 'desktop', 'parallel-performance.json');
const profile = await mkdtemp(join(tmpdir(), 'guance-parallel-perf-'));
const executable = process.env.GUANCE_EXECUTABLE ? resolve(process.env.GUANCE_EXECUTABLE) : createRequire(import.meta.url)('electron');
const recordCount = 10000; const longRecordCount = 1000; const longCharacters = 1500;
const uniqueTitle = '合成并行唯一命中9999';
const modelKey = 'LOCAL_SYNTHETIC_MODEL_ONLY';
const davPassword = 'LOCAL_SYNTHETIC_DAV_ONLY';
const syncPhrase = 'local synthetic performance sync phrase';
const modelChunks = 60; const modelChunkDelayMs = 100; const uploadChunkDelayMs = 15;
const files = new Map();
const fixtures = {
  model: { requests: [], responseChunks: 0, responseBytes: 0, active: false },
  webdav: { requests: [], activeUploads: 0, totalBytes: 0, totalChunks: 0 },
  errors: [],
};
const report = {
  at: new Date().toISOString(), platform: process.platform, node: process.version,
  mode: process.env.GUANCE_EXECUTABLE ? 'installed-executable' : 'source-electron-existing-build',
  executable, profile, status: 'not-run',
  hardware: { cpu: cpus()[0]?.model, logicalCpus: cpus().length, ramBytes: totalmem(), freeRamBeforeBytes: freemem(), architecture: arch(), osRelease: release(), storageMedia: 'not measured' },
  scope: '当前实际机器上的合成长正文及并行任务验收；不等同4核8GB参考硬件，也不代表真实模型或公网WebDAV性能。',
  isolation: { independentGuanceTestData: true, userFilesRead: false, userCredentialsRead: false, paidModelRequests: 0, realRemoteServicesUsed: false },
  data: { records: recordCount, longRecords: longRecordCount, originalCharactersPerLongRecord: longCharacters, synthetic: true },
  fixtureTiming: { modelChunks, modelChunkDelayMs, uploadChunkDelayMs, note: '有效模型JSON分块返回；WebDAV实际读取完整密文并有固定逐块延时，以形成可重复的并行传输窗口。此延时不计作真实服务性能。' },
  uiTiming: { definition: 'Playwright实际fill/click，等待期望可见结果并完成两帧绘制；包含自动化驱动开销，不是纯JS filter计时。', referenceTargetMs: 500, samples: [] },
};
let app; let page; let project; let analysisJob; let syncPromise;
let stopping = false;
let expectedModelSignals = [];

function title(index) { return index === 9999 ? uniqueTitle : `合成并行样本 ${String(index).padStart(5, '0')} · ${index < longRecordCount ? '长正文' : '短正文'}`; }
function metric(value) { return Math.round(value * 10) / 10; }
function processExists(pid) { try { process.kill(pid, 0); return true; } catch (error) { if (error.code === 'ESRCH') return false; return true; } }
function activeFixtureState() { return { modelStreaming: fixtures.model.active, modelBytes: fixtures.model.responseBytes, activeDavUploads: fixtures.webdav.activeUploads, davBytes: fixtures.webdav.totalBytes }; }
async function boundedWait(predicate, description, timeout = 20000) {
  const start = performance.now();
  while (performance.now() - start < timeout) { if (await predicate()) return; await delay(50); }
  throw new Error(`等待超时：${description}`);
}
async function body(req, maximum, onChunk) {
  const chunks = []; let size = 0;
  for await (const chunk of req) { size += chunk.length; if (size > maximum) throw new Error('测试服务请求超出预设容量'); chunks.push(chunk); if (onChunk) await onChunk(chunk); }
  return Buffer.concat(chunks);
}
function modelResult(input) {
  const date = new Date().toISOString();
  const themes = Array.from({ length: 5 }, (_, index) => ({ id: `T-PERF-${index}`, rank: index + 1, title: `合成并行主题${index + 1}`, summary: '仅归纳本机合成验收情报，不代表真实市场研究结果', mentionCount: 2, direction: '测试假设待核实', confidence: 'low', claimType: '分析推断', evidenceSignalIds: input.signals.slice(index * 2, index * 2 + 2).map(signal => signal.id), opportunity: '合成验收机会', caveat: '本机假模型输出，禁止用于业务决策' }));
  const plans = ['A', 'B'].map(code => ({ id: `PLAN-${code}`, code, name: `合成并行验收方案${code}`, shortName: `合成${code}`, positioning: '合成数据验收', audience: '虚构目标人群', platforms: ['合成性能样本'], formats: ['合成内容'], timing: '仅本机验收', coreMessage: `根据十条合成情报形成的测试方案${code}`, rationale: '引用合成主题，核对正常结构化生成及保存链路', constraints: ['禁止真实投放'], uncertainties: ['无真实市场有效性'], channels: [{ channel: '合成性能样本', budgetCents: input.company.budgetCents, role: '合成验收渠道' }], evidenceThemeIds: themes.map(theme => theme.id), updatedAt: date }));
  return { themes, plans };
}
const modelServer = createServer((req, res) => {
  res.on('error', error => { fixtures.errors.push(`model response: ${error.message}`); });
  void (async () => {
    assert.equal(req.method, 'POST'); assert.equal(req.url, '/model/chat/completions'); assert.equal(req.headers.authorization, `Bearer ${modelKey}`);
    const bytes = await body(req, 2_000_000); const request = JSON.parse(bytes.toString());
    const input = JSON.parse(request.messages.find(message => message.role === 'user').content);
    assert.deepEqual(input.signals.map(signal => signal.id), expectedModelSignals);
    assert.equal(input.signals.length, 10); assert.ok(input.signals.every(signal => signal.quote.length === longCharacters));
    assert.equal(request.model, 'local-synthetic-model');
    const response = Buffer.from(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(modelResult(input)) } }] }));
    fixtures.model.requests.push({ startedAt: new Date().toISOString(), requestBytes: bytes.length, selectedSignalIds: input.signals.map(signal => signal.id), suppliedLongQuoteCharacters: input.signals.reduce((sum, signal) => sum + signal.quote.length, 0), expectedResponseBytes: response.length });
    fixtures.model.active = true;
    res.writeHead(200, { 'content-type': 'application/json' });
    const chunkSize = Math.ceil(response.length / modelChunks);
    try {
      for (let offset = 0; offset < response.length; offset += chunkSize) {
        if (stopping || res.destroyed) break;
        const chunk = response.subarray(offset, offset + chunkSize); res.write(chunk); fixtures.model.responseChunks++; fixtures.model.responseBytes += chunk.length; await delay(modelChunkDelayMs);
      }
      if (!res.destroyed) res.end(); fixtures.model.requests.at(-1).finishedAt = new Date().toISOString();
    } finally { fixtures.model.active = false; }
  })().catch(error => { fixtures.errors.push(`model: ${error.message}`); res.destroy(error); });
});
const davServer = createServer((req, res) => {
  res.on('error', error => { fixtures.errors.push(`webdav response: ${error.message}`); });
  void (async () => {
    assert.equal(req.headers.authorization, `Basic ${Buffer.from(`fixture:${davPassword}`).toString('base64')}`);
    assert.ok(req.url.startsWith('/dav/guance-v1/'));
    const entry = { method: req.method, path: req.url, startedAt: new Date().toISOString(), bodyBytes: 0, bodyChunks: 0 };
    fixtures.webdav.requests.push(entry);
    if (req.method === 'MKCOL') { res.writeHead(201); res.end(); }
    else if (req.method === 'PROPFIND') { res.writeHead(207, { 'content-type': 'application/xml' }); res.end(`<d:multistatus xmlns:d="DAV:">${[...files.keys()].map(path => `<d:response><d:href>${path}</d:href></d:response>`).join('')}</d:multistatus>`); }
    else if (req.method === 'PUT') {
      if (files.has(req.url) && req.headers['if-none-match'] === '*') { res.writeHead(412); res.end(); return; }
      fixtures.webdav.activeUploads++;
      try {
        const bytes = await body(req, 32_000_000, async chunk => {
          entry.bodyBytes += chunk.length; entry.bodyChunks++; fixtures.webdav.totalBytes += chunk.length; fixtures.webdav.totalChunks++;
          if (req.url.endsWith('.op.json')) await delay(uploadChunkDelayMs);
        });
        files.set(req.url, bytes.toString()); res.writeHead(201); res.end();
      } finally { fixtures.webdav.activeUploads--; }
    } else if (req.method === 'GET' && files.has(req.url)) { res.setHeader('content-type', 'application/json'); res.end(files.get(req.url)); }
    else { res.writeHead(404); res.end(); }
    entry.finishedAt = new Date().toISOString();
  })().catch(error => { fixtures.errors.push(`webdav: ${error.message}`); res.destroy(error); });
});
async function listen(server) { await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); const address = server.address(); assert.ok(address && typeof address !== 'string'); return `http://127.0.0.1:${address.port}`; }
async function taskState() {
  return page.evaluate(async ({ id, jobId }) => {
    const [jobs, sync] = await Promise.all([window.guance.invoke('jobs.list', { projectId: id }), window.guance.invoke('sync.status', undefined)]);
    const job = jobs.find(job => job.id === jobId);
    return { at: new Date().toISOString(), analysis: job ? { id: job.id, status: job.status, progress: job.progress, result: job.result, error: job.error } : null, sync: { busy: sync.busy, lastSuccess: sync.lastSuccess, error: sync.error, conflicts: sync.conflicts.length } };
  }, { id: project.id, jobId: analysisJob?.id });
}
async function measure(phase, action, operation, verify) {
  const before = phase === 'baseline' ? null : await taskState(); const fixtureBefore = activeFixtureState();
  const sample = { phase, action, startedAt: new Date().toISOString(), taskBefore: before, fixtureBefore, status: 'running' };
  report.uiTiming.samples.push(sample);
  const started = performance.now();
  try {
    await operation(); await verify();
    await page.evaluate(() => new Promise(resolve => window.requestAnimationFrame(() => window.requestAnimationFrame(resolve))));
    sample.durationMs = metric(performance.now() - started); sample.finishedAt = new Date().toISOString(); sample.fixtureAfter = activeFixtureState();
    sample.status = 'passed'; sample.meetsReferenceTarget = sample.durationMs < report.uiTiming.referenceTargetMs;
  } catch (error) { sample.durationMs = metric(performance.now() - started); sample.status = 'failed'; sample.error = String(error); throw error; }
  if (phase !== 'baseline') sample.taskAfter = await taskState();
  sample.bothTasksActiveThroughoutAction = before?.analysis?.status === 'running' && before.sync.busy && fixtureBefore.modelStreaming && fixtureBefore.activeDavUploads > 0 && sample.fixtureAfter.modelStreaming && sample.fixtureAfter.activeDavUploads > 0;
}
async function uiCycle(phase) {
  const search = page.getByLabel('搜索情报', { exact: true });
  const total = page.locator('[aria-label="筛选结果概览"] strong');
  await measure(phase, 'search-unique', () => search.fill(uniqueTitle), async () => { await page.getByText(uniqueTitle, { exact: true }).waitFor(); await page.waitForFunction(() => document.querySelector('[aria-label="筛选结果概览"] strong')?.textContent === '1'); assert.equal(await total.textContent(), '1'); });
  await measure(phase, 'clear-search', () => search.fill(''), async () => { await page.getByText('第 1 / 200 页 · 每页50条', { exact: true }).waitFor(); assert.equal(await total.textContent(), String(recordCount)); });
  await measure(phase, 'next-page', () => page.getByRole('button', { name: '下一页', exact: true }).click(), async () => { await page.getByText('第 2 / 200 页 · 每页50条', { exact: true }).waitFor(); await page.getByText(title(50), { exact: true }).waitFor(); });
  await measure(phase, 'previous-page', () => page.getByRole('button', { name: '上一页', exact: true }).click(), async () => { await page.getByText('第 1 / 200 页 · 每页50条', { exact: true }).waitFor(); await page.getByText(title(0), { exact: true }).waitFor(); });
}
function decryptEnvelope(envelope, key, context) {
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(envelope.iv, 'base64')); decipher.setAAD(Buffer.from(context)); decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'));
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(envelope.data, 'base64')), decipher.final()]).toString());
}

await mkdir(dirname(output), { recursive: true });
try {
  await access(executable);
  if (!process.env.GUANCE_EXECUTABLE) for (const filename of ['dist/index.html', 'desktop-dist/main.cjs', 'desktop-dist/worker.cjs', 'desktop-dist/preload.cjs']) await access(join(root, filename));
  const [modelUrl, davUrl] = await Promise.all([listen(modelServer), listen(davServer)]);
  report.localFixtures = { model: modelUrl, webdav: davUrl, loopbackOnly: true };
  const env = { ...process.env, GUANCE_TEST_DATA: profile }; delete env.GUANCE_DEV_URL; delete env.ELECTRON_RUN_AS_NODE;
  app = await electron.launch({ executablePath: executable, args: process.env.GUANCE_EXECUTABLE ? [] : ['.'], cwd: root, env, timeout: 30000 });
  report.application = await app.evaluate(({ app }) => ({ version: app.getVersion(), isPackaged: app.isPackaged, mainPid: process.pid, electron: process.versions.electron, chrome: process.versions.chrome, userData: app.getPath('userData') }));
  assert.equal(resolve(report.application.userData), resolve(profile));
  page = await app.firstWindow({ timeout: 20000 }); page.setDefaultTimeout(30000);
  await page.getByRole('button', { name: '设置', exact: true }).waitFor();
  project = await page.evaluate(() => window.guance.invoke('projects.create', { name: '1万条合成长正文并行性能验收', mode: 'real' }));
  const now = new Date().toISOString();
  const original = '这是合成性能验收材料仅用于本地大数据量保存筛选分页模型生成和加密同步不代表真实市场观察企业客户或者广告效果';
  const longBody = original.repeat(Math.ceil(longCharacters / original.length)).slice(0, longCharacters);
  assert.equal([...longBody].length, longCharacters); assert.match(longBody, /^\p{Script=Han}+$/u);
  project.data.company = { ...project.data.company, budgetCents: 1000000, goal: '仅用于明确标记合成数据的并行性能验收' };
  project.data.sources = Array.from({ length: recordCount }, (_, index) => ({ id: `PERF-SRC-${index}`, name: `合成原文来源${index}`, platform: '合成性能样本', kind: 'industry', publishedAt: now, collectedAt: now, note: '合成验收数据，不代表真实来源', simulated: true, origin: 'demo', rawContent: index < longRecordCount ? longBody : `这是第${index}条合成短正文，仅用于性能验收` }));
  project.data.signals = project.data.sources.map((source, index) => ({ id: `PERF-S-${index}`, sourceId: source.id, title: title(index), platform: source.platform, category: 'industry', priority: 'medium', status: 'pending', relevance: 3, summary: '合成性能情报，仅用于本机保存筛选分页和并行任务验收', quote: source.rawContent, impact: '合成数据不能用于业务判断', tags: ['合成验收'], capturedAt: now, note: '本条为虚构测试材料' }));
  expectedModelSignals = project.data.signals.slice(0, 10).map(signal => signal.id);
  const saveInput = { id: project.id, revision: project.revision, data: project.data }; const serialized = JSON.stringify(saveInput);
  const serializedData = JSON.stringify(project.data);
  report.data = { ...report.data, payloadJsonCharacters: serialized.length, payloadUtf8Bytes: Buffer.byteLength(serialized), dataJsonCharacters: serializedData.length, dataUtf8Bytes: Buffer.byteLength(serializedData), longOriginalTotalCharacters: project.data.sources.slice(0, longRecordCount).reduce((sum, source) => sum + source.rawContent.length, 0), longQuotesAlsoRetained: true };
  assert.ok(serialized.length < 20_000_000, '负载必须经正常IPC的20M字符上限，不修改边界');
  const saveStarted = performance.now();
  project = await page.evaluate(input => window.guance.invoke('projects.save', input), saveInput);
  report.save = { durationMs: metric(performance.now() - saveStarted), revision: project.revision, savedRecords: project.data.signals.length, method: '正常projects.save IPC，含序列化、校验与SQLite写入' };
  assert.equal(project.data.signals.length, recordCount); assert.equal(project.data.sources.filter(source => source.rawContent.length === longCharacters).length, longRecordCount);
  await page.getByRole('button', { name: '设置', exact: true }).click(); await page.getByLabel('当前项目', { exact: true }).selectOption(project.id);
  await page.waitForFunction(id => document.querySelector('#current-project')?.value === id, project.id); await page.getByRole('button', { name: '关闭', exact: true }).click();
  const loadStarted = performance.now(); await page.goto('guance://app/signals'); await page.getByRole('button', { name: '下一页', exact: true }).waitFor();
  await page.getByText('第 1 / 200 页 · 每页50条', { exact: true }).waitFor(); report.pageLoadMs = metric(performance.now() - loadStarted);
  await uiCycle('baseline');
  const provider = await page.evaluate(({ url, key }) => window.guance.invoke('models.save', { name: '本机合成假模型', baseUrl: url + '/model', protocol: 'chat', apiKey: key, models: ['local-synthetic-model'], model: 'local-synthetic-model' }), { url: modelUrl, key: modelKey });
  await page.evaluate(id => window.guance.invoke('models.default', { id }), provider.id);
  await page.evaluate(({ url, password, passphrase }) => window.guance.invoke('sync.configure', { url: url + '/dav', username: 'fixture', password, passphrase, automatic: false }), { url: davUrl, password: davPassword, passphrase: syncPhrase });
  const concurrentStarted = performance.now();
  analysisJob = await page.evaluate(({ id, signalIds }) => window.guance.invoke('models.analyze', { projectId: id, signalIds }), { id: project.id, signalIds: expectedModelSignals });
  report.analysis = { id: analysisJob.id, initialStatus: analysisJob.status, selectedSignals: expectedModelSignals };
  syncPromise = page.evaluate(() => window.guance.invoke('sync.run', undefined)).then(status => { report.initialSync = { status: 'completed', durationMs: metric(performance.now() - concurrentStarted), returned: status }; }, error => { report.initialSync = { status: 'failed', error: String(error) }; });
  await boundedWait(() => fixtures.model.active && fixtures.webdav.activeUploads > 0 && fixtures.webdav.totalBytes > 1_000_000, '有效模型响应流与大体积密文上传同时进行');
  report.parallelStart = await taskState(); assert.equal(report.parallelStart.analysis.status, 'running'); assert.equal(report.parallelStart.sync.busy, true);
  for (let round = 0; round < 3; round++) await uiCycle('parallel');
  await boundedWait(async () => (await taskState()).analysis?.status !== 'running', '实际模型任务完成', 120000);
  report.analysis.final = (await taskState()).analysis; assert.equal(report.analysis.final.status, 'completed', JSON.stringify(report.analysis.final));
  await syncPromise; assert.equal(report.initialSync.status, 'completed', JSON.stringify(report.initialSync));
  report.parallelCompletion = await taskState(); report.parallelDurationMs = metric(performance.now() - concurrentStarted);
  await uiCycle('after-completion');
  const final = await page.evaluate(id => window.guance.invoke('projects.load', { id }), project.id);
  assert.equal(final.data.signals.length, recordCount); assert.equal(final.data.analyses?.length, 1); assert.equal(final.data.themes.length, 5); assert.equal(final.data.plans.length, 2);
  assert.deepEqual(final.data.analyses[0].evidenceSignalIds, expectedModelSignals); assert.equal(final.data.approvals.length, 0);
  report.generatedResult = { revision: final.revision, signalCount: final.data.signals.length, analyses: final.data.analyses.length, themes: final.data.themes.length, plans: final.data.plans.map(plan => ({ code: plan.code, analysisId: plan.analysisId, budgetCents: plan.channels.reduce((sum, channel) => sum + channel.budgetCents, 0) })), approvals: final.data.approvals.length };
  // The first run may have enumerated changes before model completion. A second
  // normal sync proves that the persisted generated result reaches the remote.
  const finalSyncStarted = performance.now(); const finalSync = await page.evaluate(() => window.guance.invoke('sync.run', undefined));
  assert.equal(finalSync.error, ''); assert.equal(finalSync.conflicts.length, 0);
  report.finalSync = { durationMs: metric(performance.now() - finalSyncStarted), lastSuccess: finalSync.lastSuccess, conflicts: finalSync.conflicts.length };
  const manifest = JSON.parse(files.get('/dav/guance-v1/manifest.json')); const key = pbkdf2Sync(syncPhrase, Buffer.from(manifest.salt, 'base64'), 310000, 32, 'sha256');
  const context = `guance-v${manifest.version}`; assert.equal(decryptEnvelope(manifest.encrypted, key, context + ':manifest').product, 'guance-sync');
  const operations = [...files.entries()].filter(([path]) => path.endsWith('.op.json')).map(([path, bytes]) => {
    assert.ok(!bytes.includes(modelKey) && !bytes.includes(davPassword) && !bytes.includes(syncPhrase) && !bytes.includes(uniqueTitle), '远端仅允许加密业务版本');
    const id = path.split('/').at(-1).slice(0, -8); return decryptEnvelope(JSON.parse(bytes), key, `${context}:${id}`);
  });
  const remote = operations.find(operation => operation.projectId === final.id && operation.revision === final.revision);
  assert.ok(remote, '已保存的生成结果必须通过正常加密同步到达假WebDAV'); assert.equal(remote.project.data.signals.length, recordCount); assert.equal(remote.project.data.analyses.length, 1);
  report.remote = { protocol: manifest.version, verification: '正常客户端加密上传；测试程序使用假口令解密核对落盘内容，未代替第二客户端下载验收', encryptedFiles: files.size, encryptedOperationFiles: operations.length, transferredCiphertextBytes: fixtures.webdav.totalBytes, storedCiphertextBytes: [...files.values()].reduce((sum, value) => sum + Buffer.byteLength(value), 0), finalRevisionVerified: remote.revision, finalSignalCount: remote.project.data.signals.length, finalAnalysisCount: remote.project.data.analyses.length, plaintextBusinessOrCredentialsFound: false };
  const overlap = report.uiTiming.samples.filter(sample => sample.phase === 'parallel' && sample.bothTasksActiveThroughoutAction);
  report.uiTiming.confirmedOverlappingActions = overlap.map(sample => ({ action: sample.action, durationMs: sample.durationMs }));
  assert.ok(overlap.some(sample => sample.action === 'search-unique') && overlap.some(sample => sample.action === 'next-page'), '必须实际测到两任务运行期间的搜索和分页，不能用已结束任务代替');
  report.uiTiming.maximumMs = Math.max(...report.uiTiming.samples.map(sample => sample.durationMs));
  report.uiTiming.meetsReferenceTargetOnThisMachine = report.uiTiming.samples.every(sample => sample.meetsReferenceTarget);
  assert.equal(fixtures.model.requests.length, 1); assert.equal(fixtures.errors.length, 0, JSON.stringify(fixtures.errors));
  report.applicationMetrics = await app.evaluate(({ app }) => app.getAppMetrics().map(metric => ({ pid: metric.pid, type: metric.type, name: metric.name, cpu: metric.cpu, memory: metric.memory })));
  report.status = report.uiTiming.meetsReferenceTargetOnThisMachine ? 'passed' : 'target-missed';
} catch (error) { report.status = 'failed'; report.error = error instanceof Error ? error.stack : String(error); }
finally {
  stopping = true;
  if (app) {
    let tracked = [];
    try { tracked = await app.evaluate(({ app }) => app.getAppMetrics().map(({ pid, type, name }) => ({ pid, type, name }))); } catch { /* The app may already have exited after a failure. */ }
    const child = app.process(); const launcherPid = child.pid; const mainPid = report.application?.mainPid ?? launcherPid;
    const pids = [...new Set([launcherPid, mainPid, ...tracked.map(item => item.pid)])];
    try {
      await app.close(); report.applicationClosed = true;
      await boundedWait(() => pids.every(pid => !processExists(pid)), '本轮测试应用及已记录子进程退出', 10000);
      report.cleanup = { launcherPid, mainPid, trackedProcesses: tracked, remainingPids: pids.filter(processExists), applicationExitCode: child.exitCode, applicationExitSignal: child.signalCode, testProcessesExited: true };
    } catch (error) { report.closeError = String(error); report.cleanup = { launcherPid, mainPid, trackedProcesses: tracked, remainingPids: pids.filter(processExists), testProcessesExited: false }; report.status = 'failed'; }
  }
  for (const server of [modelServer, davServer]) { server.closeAllConnections(); if (server.listening) await new Promise(resolve => server.close(resolve)); }
  if (syncPromise) await syncPromise;
  try { await boundedWait(() => !fixtures.model.active && fixtures.webdav.activeUploads === 0, '本机网络fixture处理结束', 5000); report.fixtureHandlersStopped = true; }
  catch (error) { report.fixtureCleanupError = String(error); report.status = 'failed'; }
  report.fixtures = fixtures; report.hardware.freeRamAfterBytes = freemem(); report.finishedAt = new Date().toISOString();
  await writeFile(output, JSON.stringify(report, null, 2) + '\n');
}
console.log(JSON.stringify({ status: report.status, mode: report.mode, version: report.application?.version, records: report.data.records, longRecords: report.data.longRecords, payloadUtf8Bytes: report.data.payloadUtf8Bytes, saveMs: report.save?.durationMs, maximumUiMs: report.uiTiming.maximumMs, overlappingActions: report.uiTiming.confirmedOverlappingActions?.length, error: report.error, output }, null, 2));
if (report.status !== 'passed') process.exitCode = 1;
