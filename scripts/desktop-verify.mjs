import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const data = await mkdtemp(join(tmpdir(), 'guance-desktop-'));
const results = [];
await mkdir('docs/desktop', { recursive: true });
let app;
async function launch() {
  const instance = await electron.launch({ args: ['.'], env: { ...process.env, GUANCE_TEST_DATA: data }, timeout: 30000 });
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
  console.log(results.join('\n'));
} finally {
  if (app) await app.close();
  await writeFile('docs/desktop/results.json', JSON.stringify({ at: new Date().toISOString(), platform: process.platform, data, results }, null, 2));
}
