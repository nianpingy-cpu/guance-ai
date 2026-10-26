import { _electron as electron } from 'playwright';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import assert from 'node:assert/strict';
const files = new Map(); const instances = []; const results = [];
const external = process.env.WEBDAV_URL;
const server = createServer(async (req, res) => {
  const path = req.url;
  if (req.method === 'MKCOL') { res.writeHead(201); res.end(); }
  else if (req.method === 'PROPFIND') { res.writeHead(207, { 'content-type': 'application/xml' }); res.end(`<d:multistatus xmlns:d="DAV:">${[...files.keys()].map((p) => `<d:response><d:href>${p}</d:href></d:response>`).join('')}</d:multistatus>`); }
  else if (req.method === 'PUT') { if (files.has(path) && req.headers['if-none-match'] === '*') { res.writeHead(412); res.end(); return; } let body = ''; for await (const c of req) body += c; files.set(path, body); res.writeHead(201); res.end(); }
  else if (files.has(path)) res.end(files.get(path)); else { res.writeHead(404); res.end(); }
});
if (!external) await new Promise((r) => server.listen(0, '127.0.0.1', r));
const config = { url: external ?? `http://127.0.0.1:${server.address().port}`, username: process.env.WEBDAV_USER ?? 'fixture', password: process.env.WEBDAV_PASSWORD ?? 'FIXTURE_ONLY', passphrase: 'local fixture long passphrase', automatic: false };
try {
  for (let i = 0; i < 2; i++) { const data = await mkdtemp(join(tmpdir(), `guance-sync-${i}-`)); const app = await electron.launch({ args: ['.'], env: { ...process.env, GUANCE_TEST_DATA: data } }); instances.push(app); }
  const [a, b] = await Promise.all(instances.map((app) => app.firstWindow()));
  for (const p of [a, b]) { await p.getByRole('button', { name: '设置', exact: true }).waitFor(); await p.evaluate((config) => window.guance.invoke('sync.configure', config), config); }
  const project = await a.evaluate(() => window.guance.invoke('projects.create', { name: '双桌面同步验收', mode: 'real' }));
  await a.evaluate(() => window.guance.invoke('sync.run', undefined)); await b.evaluate(() => window.guance.invoke('sync.run', undefined));
  const received = await b.evaluate((id) => window.guance.invoke('projects.load', { id }), project.id); assert.equal(received.revision, project.revision);
  if (external && process.env.WEBDAV_STORE) { const directory = join(process.env.WEBDAV_STORE, 'guance-v1'); const names = (await readdir(directory)).filter((n) => n.endsWith('.json')); assert.ok(names.length >= 3); for (const name of names) { const body = await readFile(join(directory, name), 'utf8'); assert.ok(!body.includes('双桌面同步验收')); assert.ok(!body.includes(config.password)); } results.push(`独立WebDAV服务器实际落盘${names.length}个加密文件，无业务明文或凭据`); }
  else { assert.ok(![...files.values()].join('').includes('双桌面同步验收')); assert.ok(![...files.values()].join('').includes('FIXTURE_ONLY')); }
  results.push(`两个原生Electron进程、不同用户数据目录、${external ? '独立WebDAV服务器' : '本机协议测试服务'}：业务同步成功`);
  for (const [page, amount] of [[a, 111100], [b, 222200]]) { const p = await page.evaluate((id) => window.guance.invoke('projects.load', { id }), project.id); p.data.company.budgetCents = amount; await page.evaluate((p) => window.guance.invoke('projects.save', { id: p.id, revision: p.revision, data: p.data }), p); }
  for (const page of [a, b, a]) await page.evaluate(() => window.guance.invoke('sync.run', undefined));
  const conflict = await b.evaluate(() => window.guance.invoke('sync.status', undefined)); assert.equal(conflict.conflicts.length, 1);
  await b.evaluate((id) => window.guance.invoke('sync.resolve', { id, choice: 'remote' }), conflict.conflicts[0].id);
  for (const page of [b, a]) await page.evaluate(() => window.guance.invoke('sync.run', undefined));
  for (const page of [a, b]) { const p = await page.evaluate((id) => window.guance.invoke('projects.load', { id }), project.id); assert.equal(p.data.company.budgetCents, 111100); const s = await page.evaluate(() => window.guance.invoke('sync.status', undefined)); assert.equal(s.conflicts.length, 0); }
  results.push('双端并发修改保留冲突；人工采用远端后两端一致；未选版本保留为独立项目');
  console.log(results.join('\n'));
} finally { for (const app of instances) await app.close(); if (!external) { server.closeAllConnections(); await new Promise((r) => server.close(r)); } await mkdir('docs/desktop', { recursive: true }); await writeFile(`docs/desktop/${external ? 'sync-real-server' : 'sync-results'}.json`, JSON.stringify({ at: new Date().toISOString(), platform: process.platform, server: external ? (process.env.WEBDAV_SERVER_NAME ?? external) : 'local protocol fixture; external WebDAV not tested', results }, null, 2)); }
