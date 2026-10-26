// @vitest-environment node
import { describe, it, expect, afterEach } from 'vitest';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LocalDatabase } from './database';
import { ModelService, validateAnalysis } from './models';
const dirs: string[] = []; const dbs: LocalDatabase[] = [];
afterEach(() => { dbs.forEach((d) => d.close()); dbs.length = 0; dirs.splice(0).forEach((p) => rmSync(p, { recursive: true, force: true })); });
function setup() { const dir = mkdtempSync(join(tmpdir(), 'guance-model-')); dirs.push(dir); const db = new LocalDatabase(dir); dbs.push(db); return db; }
describe('模型边界', () => {
  it('三种协议发出实际HTTP请求，解析结果；401不重复提交；取消中止请求', async () => {
    const requests: Array<{ path: string; key: string; body: string }> = [];
    const server = createServer(async (req, res) => { let body = ''; for await (const chunk of req) body += chunk; requests.push({ path: req.url!, key: String(req.headers.authorization ?? req.headers['x-api-key']), body });
      res.setHeader('content-type', 'application/json');
      if (req.url?.includes('bad')) { res.writeHead(401); res.end('{"error":"secret from remote"}'); }
      else if (req.url?.includes('slow')) { req.on('close', () => res.destroy()); }
      else if (req.url?.endsWith('models')) res.end(JSON.stringify({ data: [{ id: 'm' }] }));
      else if (req.url?.endsWith('responses')) res.end(JSON.stringify({ output: [{ type: 'message', content: [{ type: 'output_text', text: 'OK' }] }] }));
      else if (req.url?.endsWith('messages')) res.end(JSON.stringify({ content: [{ type: 'text', text: 'OK' }] }));
      else res.end(JSON.stringify({ choices: [{ message: { content: 'OK' } }] }));
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    const address = server.address(); if (!address || typeof address === 'string') throw new Error('no port');
    const db = setup(); const service = new ModelService(db, { encrypt: async (s) => s, decrypt: async (s) => s });
    try {
      for (const protocol of ['chat', 'responses', 'anthropic'] as const) { const p = await service.save({ name: protocol, baseUrl: `http://127.0.0.1:${address.port}/v1`, protocol, apiKey: 'LOCAL_FIXTURE_KEY', models: ['m'], model: 'm' }); expect(await service.complete(p.id, 'sys', 'input')).toBe('OK'); expect(await service.discover(p.id)).toEqual(['m']); }
      expect(requests[0].key).toBe('Bearer LOCAL_FIXTURE_KEY'); expect(requests[4].key).toBe('LOCAL_FIXTURE_KEY');
      const p = await service.save({ name: 'bad', baseUrl: `http://127.0.0.1:${address.port}/bad`, protocol: 'chat', apiKey: 'k', models: ['m'], model: 'm' });
      const count = requests.length; await expect(service.complete(p.id, '', '')).rejects.toThrow(/HTTP 401/); expect(requests.length).toBe(count + 1);
      const slow = await service.save({ name: 'slow', baseUrl: `http://127.0.0.1:${address.port}/slow`, protocol: 'chat', apiKey: 'k', models: ['m'], model: 'm' });
      const controller = new AbortController(); const task = service.complete(slow.id, '', '', controller.signal); controller.abort(); await expect(task).rejects.toThrow(/取消/);
    } finally { server.closeAllConnections(); await new Promise<void>((r) => server.close(() => r())); }
  });
  it('只返回密钥状态；没有默认模型时阻止AI任务', async () => {
    const db = setup(); const service = new ModelService(db, { encrypt: async (s) => 'cipher:' + s, decrypt: async (s) => s.slice(7) });
    const p = db.create('demo', 'demo');
    await expect(service.analyze(p.id, ['S-01'])).rejects.toThrow(/默认模型/);
    const config = await service.save({ name: '测试', baseUrl: 'https://example.com/v1', protocol: 'chat', apiKey: 'SECRET_123', models: ['m'], model: 'm' });
    expect(JSON.stringify(config)).not.toContain('SECRET'); expect(config.hasKey).toBe(true);
    expect(JSON.stringify(db.list())).not.toContain('SECRET');
    await expect(service.save({ ...config, baseUrl: 'https://user:password@example.com' })).rejects.toThrow();
  });
  it('模型结果引用不存在或预算超限时拒绝，不覆盖已有方案', () => {
    const db = setup(); const p = db.create('demo', 'demo');
    const result = { themes: p.data.themes, plans: p.data.plans };
    expect(() => validateAnalysis(result, p.data, ['S-01'])).toThrow(/引用/);
    result.themes = [p.data.themes[0]]; result.themes[0].evidenceSignalIds = ['S-01'];
    result.plans = p.data.plans.map((plan) => ({ ...plan, evidenceThemeIds: [result.themes[0].id], channels: [{ channel: '小红书', budgetCents: p.data.company.budgetCents + 1, role: '' }] }));
    expect(() => validateAnalysis(result, p.data, ['S-01'])).toThrow(/预算/);
    expect(db.load(p.id).revision).toBe(p.revision);
  });
});
