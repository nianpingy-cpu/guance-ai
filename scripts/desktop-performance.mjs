import { _electron as electron } from 'playwright';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir, cpus, totalmem } from 'node:os';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
const data = await mkdtemp(join(tmpdir(), 'guance-perf-'));
const app = await electron.launch({ args: ['.'], env: { ...process.env, GUANCE_TEST_DATA: data } }); const page = await app.firstWindow();
try {
  await page.getByRole('button', { name: '设置', exact: true }).waitFor();
  const project = await page.evaluate(() => window.guance.invoke('projects.create', { name: '1万条情报性能验收', mode: 'real' }));
  const now = new Date().toISOString();
  project.data.sources = Array.from({ length: 10000 }, (_, i) => ({ id: `SRC-${i}`, name: `来源${i}`, platform: '性能样本', kind: 'industry', publishedAt: now, note: '合成性能数据', simulated: true }));
  project.data.signals = project.data.sources.map((s, i) => ({ id: `S-${i}`, sourceId: s.id, title: i === 9999 ? '唯一匹配性能记录' : `性能样本记录${i}`, platform: s.platform, category: 'industry', priority: 'medium', status: 'pending', relevance: 3, summary: '合成性能样本，不代表市场信息', quote: '只用于验证大量记录的保存与筛选响应', impact: '', tags: [], capturedAt: now, note: '' }));
  const start = performance.now(); await page.evaluate((p) => window.guance.invoke('projects.save', { id: p.id, revision: p.revision, data: p.data }), project); const saveMs = performance.now() - start;
  await page.getByRole('button', { name: '设置', exact: true }).click(); await page.getByLabel('当前项目').selectOption(project.id); await page.waitForFunction((id) => document.querySelector('#current-project')?.value === id, project.id); await page.getByRole('button', { name: '关闭', exact: true }).click();
  await page.goto('guance://app/signals'); await page.getByRole('button', { name: '下一页', exact: true }).waitFor();
  const queryStart = performance.now(); await page.getByLabel('搜索情报').fill('唯一匹配性能记录'); await page.getByText('唯一匹配性能记录', { exact: true }).waitFor(); const filterMs = performance.now() - queryStart;
  assert.equal(await page.getByText('唯一匹配性能记录', { exact: true }).count(), 1);
  const result = { at: new Date().toISOString(), platform: process.platform, cpu: cpus()[0]?.model, logicalCpus: cpus().length, ramGiB: Math.round(totalmem() / 2 ** 30), records: 10000, saveMs: Math.round(saveMs), filterMs: Math.round(filterMs), referenceTargetMs: 500, meetsFilterTarget: filterMs < 500, note: '合成短文本记录；当前机器实测，不替代4核8GB基准机；未做长正文压力或多任务并行性能验收' };
  await mkdir('docs/desktop', { recursive: true }); await writeFile('docs/desktop/performance.json', JSON.stringify(result, null, 2)); console.log(JSON.stringify(result));
} finally { await app.close(); }
