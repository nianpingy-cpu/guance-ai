import { _electron as electron } from 'playwright';
import { mkdtemp, mkdir, readdir, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import assert from 'node:assert/strict';
import { buildPlanFingerprint } from '../src/lib/calculations.ts';
const stress = process.env.GUANCE_LONG_TEXT === '1';
const out = stress ? 'docs/desktop-long-text' : 'docs/desktop-visual'; await mkdir(out, { recursive: true });
for (const name of await readdir(out)) if (/^native-.*\.png$/.test(name)) await unlink(join(out, name));
const data = await mkdtemp(join(tmpdir(), 'guance-layout-'));
const app = await electron.launch({ args: ['.'], env: { ...process.env, GUANCE_TEST_DATA: data } }); const page = await app.firstWindow(); const results = [];
async function check(name) {
  await page.evaluate(() => document.fonts.ready);
  const errors = await page.evaluate(() => {
    if (![...document.fonts].some((font) => font.status === 'loaded' && font.family.includes('Noto Sans SC Variable'))) return ['应用内置字体尚未加载'];
    const errors = []; if (document.documentElement.scrollWidth > window.innerWidth + 1) { errors.push('页面横向溢出'); if (document.documentElement.scrollWidth > window.innerWidth + 10) errors.push(JSON.stringify([...document.querySelectorAll('main *')].filter((e) => { const r = e.getBoundingClientRect(); return r.right > window.innerWidth + 10 && r.width > 100; }).slice(0, 8).map((e) => ({ tag: e.tagName, class: e.className, text: e.textContent.slice(0, 60), width: e.getBoundingClientRect().width })))); }
    for (const modal of document.querySelectorAll('[role="dialog"]')) { const r = modal.getBoundingClientRect(); if (r.left < -1 || r.right > window.innerWidth + 1 || r.top < -1 || r.bottom > window.innerHeight + 1) errors.push(`弹窗超出可用区域:${r.x},${r.y},${r.width},${r.height}`); }
    for (const svg of document.querySelectorAll('svg.chart-svg')) { if (!svg.checkVisibility()) continue; const labels = [...svg.querySelectorAll('text')].map((e) => ({ text: e.textContent, r: e.getBoundingClientRect() })); labels.forEach((a, i) => labels.slice(i + 1).forEach((b) => { if (Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left) > 1 && Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top) > 1) errors.push(`${a.text}/${b.text}`); })); }
    return errors;
  });
  results.push({ name, errors }); if (name.includes('-1-') || errors.length) await page.screenshot({ path: `${out}/${name}.png`, fullPage: true });
}
try {
  await page.getByRole('button', { name: '设置', exact: true }).waitFor();
  if (stress) {
    const p = await page.evaluate(async () => { const list = await window.guance.invoke('projects.list', undefined); return window.guance.invoke('projects.load', { id: list[0].id }); });
    const text = '长文本验收用于检查标题与说明是否换行并保持完整信息可查看'.repeat(4);
    p.data.company.goal = text + 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.repeat(8); p.data.company.brand = text;
    const names = new Map(p.data.plans.flatMap((plan) => plan.channels.map((c) => [c.channel, c.channel + text.slice(0, 35)])));
    for (const theme of p.data.themes) { theme.title += text; theme.direction += text; }
    for (const signal of p.data.signals) { signal.title += text; signal.platform += text.slice(0, 35); }
    for (const plan of p.data.plans) { plan.name += text; plan.shortName += text; plan.channels.forEach((c) => { c.channel = names.get(c.channel); }); }
    for (const approval of p.data.approvals) { approval.plan.name += text; approval.plan.shortName += text; approval.plan.channels.forEach((c) => { c.channel = names.get(c.channel); }); approval.fingerprint = buildPlanFingerprint(approval.plan, approval.companyBudgetCents, approval.evidence); }
    for (const review of p.data.reviews) review.channels.forEach((c) => { c.channel = names.get(c.channel); });
    const imported = await page.evaluate((data) => window.guance.invoke('projects.import', { name: '长文本UI验收', snapshot: data }), p.data);
    await page.evaluate((id) => localStorage.setItem('guance:last-project', id), imported.id);
  }
  for (const [w, h] of (process.env.GUANCE_DEBUG_LONG ? [[1440, 900]] : [[1440, 900], [1366, 768], [1280, 800], [1024, 768]])) {
    await app.evaluate(({ BrowserWindow }, size) => BrowserWindow.getAllWindows()[0].setContentSize(size.w, size.h), { w, h });
    for (const z of (process.env.GUANCE_DEBUG_LONG ? [1] : [1, 1.25, 1.5])) {
      await app.evaluate(({ BrowserWindow }, zoom) => BrowserWindow.getAllWindows()[0].webContents.setZoomFactor(zoom), z);
      for (const route of ['dashboard', 'signals', 'strategy', 'review']) { await page.goto(`guance://app/${route}`); await page.getByRole('heading', { level: 1 }).waitFor(); await page.evaluate(() => document.querySelectorAll('details').forEach((d) => { d.open = true; })); await check(`native-${w}-${z}-${route}`); }
      if (!stress) { await page.getByRole('button', { name: '设置', exact: true }).click();
        for (const [tab, label] of [['项目与备份', 'projects'], ['模型连接', 'models'], ['来源连接（可选）', 'connections'], ['跨设备同步（WebDAV）', 'sync']]) { await page.getByRole('button', { name: tab, exact: true }).click(); await check(`native-${w}-${z}-settings-${label}`); }
        await page.getByRole('button', { name: '关闭', exact: true }).click(); }
    }
  }
  console.log(`${results.length} desktop layout states; ${results.filter((r) => r.errors.length).length} failed`);
  assert.equal(results.filter((r) => r.errors.length).length, 0, JSON.stringify(results.filter((r) => r.errors.length).slice(0, 5)));
} finally { await app.close(); await writeFile(`${out}/results.json`, JSON.stringify(results, null, 2)); }
