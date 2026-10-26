import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';
const data = await mkdtemp(join(tmpdir(), 'guance-desktop-'));
const results = [];
await mkdir('docs/desktop', { recursive: true });
let app;
async function launch() {
  const instance = await electron.launch({ ...(process.env.GUANCE_EXECUTABLE ? { executablePath: process.env.GUANCE_EXECUTABLE, args: [] } : { args: ['.'] }), env: { ...process.env, GUANCE_TEST_DATA: data }, timeout: 30000 });
  instance.on('console', (m) => { if (m.type() === 'error') console.error(m.text()); });
  const page = await instance.firstWindow(); await page.getByRole('button', { name: '设置', exact: true }).waitFor();
  return [instance, page];
}
try {
  let page; [app, page] = await launch();
  assert.deepEqual(await page.evaluate(() => ({ require: typeof window.require, process: typeof window.process })), { require: 'undefined', process: 'undefined' });
  results.push('渲染页面无Node权限');
  const demo = await page.evaluate(() => window.guance.invoke('projects.list', undefined));
  assert.equal(demo.length, 1);
  const sample = await page.evaluate((id) => window.guance.invoke('projects.load', { id }), demo[0].id);
  const fixture = createServer(async (req, res) => { for await (const chunk of req) { void chunk; } res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ themes: sample.data.themes, plans: sample.data.plans }) } }] })); });
  await new Promise((r) => fixture.listen(0, '127.0.0.1', r)); const port = fixture.address().port;
  try {
    const provider = await page.evaluate((port) => window.guance.invoke('models.save', { name: '本机协议测试', baseUrl: `http://127.0.0.1:${port}`, protocol: 'chat', apiKey: 'LOCAL_FIXTURE_ONLY', models: ['fixture'], model: 'fixture' }), port);
    assert.equal(provider.hasKey, true); assert.ok(!JSON.stringify(provider).includes('LOCAL_FIXTURE_ONLY'));
    await page.evaluate((id) => window.guance.invoke('models.default', { id }), provider.id);
    await page.evaluate((p) => window.guance.invoke('models.analyze', { projectId: p.id, signalIds: p.data.signals.map((s) => s.id) }), sample);
    for (let i = 0; i < 300; i++) { const list = await page.evaluate((id) => window.guance.invoke('jobs.list', { projectId: id }), sample.id); if (list.length && list.every((j) => j.status !== 'running')) break; await delay(100); }
    const jobs = await page.evaluate((id) => window.guance.invoke('jobs.list', { projectId: id }), sample.id); assert.equal(jobs[0].status, 'completed', JSON.stringify(jobs));
    const generated = await page.evaluate((id) => window.guance.invoke('projects.load', { id }), sample.id); assert.equal(generated.data.analyses.length, 1);
    assert.ok(!JSON.stringify(generated.data).includes('LOCAL_FIXTURE_ONLY'));
    for (const filename of ['guance.sqlite', 'guance.sqlite-wal']) { const bytes = await readFile(join(data, 'data', filename)).catch(() => null); if (bytes) assert.ok(!bytes.includes('LOCAL_FIXTURE_ONLY')); }
    results.push(`${process.platform}系统加密实际保存测试凭据；本机HTTP协议端到端生成与引用审计（非真实模型）`);
  } finally { fixture.closeAllConnections(); await new Promise((r) => fixture.close(r)); }
  await assert.rejects(page.evaluate(() => window.guance.invoke('arbitrary.execute', { cmd: 'noop' })), /不支持/);
  results.push('IPC白名单拒绝未声明命令');
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await page.getByLabel('新项目名称').fill('桌面持久化验收');
  await page.getByRole('button', { name: '创建项目', exact: true }).click();
  await page.getByText('项目已创建并切换', { exact: true }).waitFor();
  await page.getByRole('button', { name: '关闭', exact: true }).click();
  const projects = await page.evaluate(() => window.guance.invoke('projects.list', undefined));
  const real = projects.find((p) => p.mode === 'real'); assert.ok(real);
  await assert.rejects(page.evaluate((id) => window.guance.invoke('projects.resetDemo', { id }), real.id), /真实项目/);
  results.push('多项目隔离与真实项目重置保护');
  const p = await page.evaluate((id) => window.guance.invoke('projects.load', { id }), real.id);
  p.data.company.budgetCents = 654321;
  await page.evaluate((p) => window.guance.invoke('projects.save', { id: p.id, revision: p.revision, data: p.data }), p);
  for (const path of ['dashboard', 'signals', 'strategy', 'review']) {
    await page.goto(`guance://app/${path}`); await page.getByRole('button', { name: '设置', exact: true }).waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false);
    await page.screenshot({ path: `docs/desktop/${path}.png`, fullPage: true });
  }
  await app.close(); app = undefined;
  [app, page] = await launch();
  const restored = await page.evaluate((id) => window.guance.invoke('projects.load', { id }), real.id);
  assert.equal(restored.data.company.budgetCents, 654321);
  results.push('真实SQLite关闭重开保留金额与项目；四页无横向溢出');
  const exited = new Promise((resolve) => app.process().once('exit', resolve));
  await app.evaluate(({ app }) => app.exit(12)).catch(() => undefined); await exited; app = undefined;
  [app, page] = await launch();
  assert.equal((await page.evaluate((id) => window.guance.invoke('projects.load', { id }), real.id)).data.company.budgetCents, 654321);
  results.push('直接退出进程后已提交数据仍可恢复');
  console.log(results.join('\n'));
} finally {
  if (app) await app.close();
  await writeFile('docs/desktop/results.json', JSON.stringify({ at: new Date().toISOString(), platform: process.platform, data, results }, null, 2));
}
