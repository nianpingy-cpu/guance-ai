import { _electron as electron } from 'playwright';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import assert from 'node:assert/strict';
const out = 'docs/desktop-visual'; await mkdir(out, { recursive: true });
const data = await mkdtemp(join(tmpdir(), 'guance-layout-'));
const app = await electron.launch({ args: ['.'], env: { ...process.env, GUANCE_TEST_DATA: data } }); const page = await app.firstWindow(); const results = [];
async function check(name) {
  const errors = await page.evaluate(() => {
    const errors = []; if (document.documentElement.scrollWidth > window.innerWidth + 1) errors.push('页面横向溢出');
    for (const modal of document.querySelectorAll('[role="dialog"]')) { const r = modal.getBoundingClientRect(); if (r.left < -1 || r.right > window.innerWidth + 1 || r.top < -1 || r.bottom > window.innerHeight + 1) errors.push(`弹窗超出可用区域:${r.x},${r.y},${r.width},${r.height}`); }
    for (const svg of document.querySelectorAll('svg.chart-svg')) { if (!svg.checkVisibility()) continue; const labels = [...svg.querySelectorAll('text')].map((e) => ({ text: e.textContent, r: e.getBoundingClientRect() })); labels.forEach((a, i) => labels.slice(i + 1).forEach((b) => { if (Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left) > 1 && Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top) > 1) errors.push(`${a.text}/${b.text}`); })); }
    return errors;
  });
  results.push({ name, errors }); if (name.includes('-1-') || errors.length) await page.screenshot({ path: `${out}/${name}.png`, fullPage: true });
}
try {
  await page.getByRole('button', { name: '设置', exact: true }).waitFor();
  for (const [w, h] of [[1440, 900], [1366, 768], [1280, 800], [1024, 768]]) {
    await app.evaluate(({ BrowserWindow }, size) => BrowserWindow.getAllWindows()[0].setContentSize(size.w, size.h), { w, h });
    for (const z of [1, 1.25, 1.5]) {
      await app.evaluate(({ BrowserWindow }, zoom) => BrowserWindow.getAllWindows()[0].webContents.setZoomFactor(zoom), z);
      for (const route of ['dashboard', 'signals', 'strategy', 'review']) { await page.goto(`guance://app/${route}`); await page.getByRole('heading', { level: 1 }).waitFor(); await page.evaluate(() => document.querySelectorAll('details').forEach((d) => { d.open = true; })); await check(`native-${w}-${z}-${route}`); }
      await page.getByRole('button', { name: '设置', exact: true }).click();
      for (const [tab, label] of [['项目与备份', 'projects'], ['模型连接', 'models'], ['来源连接', 'connections'], ['数据同步', 'sync']]) { await page.getByRole('button', { name: tab, exact: true }).click(); await check(`native-${w}-${z}-settings-${label}`); }
      await page.getByRole('button', { name: '关闭', exact: true }).click();
    }
  }
  console.log(`${results.length} desktop layout states; ${results.filter((r) => r.errors.length).length} failed`);
  assert.equal(results.filter((r) => r.errors.length).length, 0, JSON.stringify(results.filter((r) => r.errors.length).slice(0, 5)));
} finally { await app.close(); await writeFile(`${out}/results.json`, JSON.stringify(results, null, 2)); }
