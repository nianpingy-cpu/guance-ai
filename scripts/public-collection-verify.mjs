import { _electron as electron } from 'playwright';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
const url = process.env.PUBLIC_FEED ?? 'https://blog.rust-lang.org/feed.xml';
const data = await mkdtemp(join(tmpdir(), 'guance-public-'));
const app = await electron.launch({ args: ['.'], env: { ...process.env, GUANCE_TEST_DATA: data } });
let record;
try { const page = await app.firstWindow(); await page.getByRole('button', { name: '设置', exact: true }).waitFor(); const p = await page.evaluate(() => window.guance.invoke('projects.create', { name: '公开RSS接通验收', mode: 'real' }));
  await page.evaluate(({ id, url }) => window.guance.invoke('collect.start', { projectId: id, kind: 'rss', url }), { id: p.id, url });
  let jobs = []; for (let i = 0; i < 45; i++) { jobs = await page.evaluate((id) => window.guance.invoke('jobs.list', { projectId: id }), p.id); if (jobs.length && jobs.every((j) => j.status !== 'running')) break; await delay(1000); }
  const result = await page.evaluate((id) => window.guance.invoke('projects.load', { id }), p.id);
  record = { at: new Date().toISOString(), source: url, job: jobs[0], added: result.data.signals.length, hasProvenance: result.data.sources.every((s) => s.url && s.contentHash && s.taskId && s.collectedAt), note: '独立临时项目；真实公开RSS读取，非社交平台授权证明' }; console.log(JSON.stringify(record));
} catch (e) { record = { at: new Date().toISOString(), source: url, status: 'FAIL', error: String(e) }; console.error(JSON.stringify(record)); }
finally { await app.close(); await mkdir('docs/desktop', { recursive: true }); await writeFile('docs/desktop/public-collection.json', JSON.stringify(record, null, 2)); }
