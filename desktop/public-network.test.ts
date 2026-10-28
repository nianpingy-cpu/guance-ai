// @vitest-environment node
import { it, expect, vi, afterEach } from 'vitest';
import { lookup } from 'node:dns/promises';
import type { LookupAddress } from 'node:dns';
import { Readable } from 'node:stream';
import type { IncomingMessage } from 'node:http';
import { gzipSync, deflateSync, brotliCompressSync } from 'node:zlib';
import { Buffer } from 'node:buffer';
import { privateIP, validateCollectionURL } from './collect';
import { preparePublicRequest, readPublicBody } from './public-network';
vi.mock('node:dns/promises', () => ({ lookup: vi.fn() }));
const lookupAll: (hostname: string, options: { all: true; verbatim: true }) => Promise<LookupAddress[]> = lookup;
afterEach(() => vi.resetAllMocks());
it('官方平台地址带域名尾点时仍需授权接口', () => {
  for (const url of ['https://mp.weixin.qq.com./a', 'https://www.xiaohongshu.com./a', 'https://XHSLINK.COM./a', 'https://www.douyin.com./a']) expect(() => validateCollectionURL(url)).toThrow(/待开通/);
});
it('采集地址分类拒绝映射与兼容形式的本机/私有地址', () => {
  for (const ip of ['::ffff:7f00:1', '::ffff:a00:1', '0:0:0:0:0:ffff:c0a8:101', '::127.0.0.1', '0:0:0:0:0:0:0:1', '192.0.2.1', '198.18.0.1']) expect(privateIP(ip), ip).toBe(true);
  for (const ip of ['8.8.8.8', '1.1.1.1', '2606:4700::1111', '2001:4860:4860::8888']) expect(privateIP(ip), ip).toBe(false);
});
it('实际请求使用已核实的解析结果，同时保留原域名与TLS验证', async () => {
  vi.mocked(lookupAll).mockResolvedValueOnce([{ address: '93.184.216.34', family: 4 }]);
  const options = await preparePublicRequest(new URL('https://feed.example/path'));
  expect(options.hostname).toBe('feed.example'); expect(options.rejectUnauthorized).toBe(true); expect(options.agent).toBe(false);
  vi.mocked(lookupAll).mockResolvedValueOnce([{ address: '127.0.0.1', family: 4 }]);
  const resolved = await new Promise((resolve, reject) => options.lookup!('feed.example', { all: true }, (error, address) => error ? reject(error) : resolve(address)));
  expect(resolved).toEqual([{ address: '93.184.216.34', family: 4 }]); expect(lookup).toHaveBeenCalledTimes(1);
});
it('解析结果中包含非公开地址或取消时不创建连接', async () => {
  vi.mocked(lookupAll).mockResolvedValueOnce([{ address: '93.184.216.34', family: 4 }, { address: '10.0.0.1', family: 4 }]);
  await expect(preparePublicRequest(new URL('https://feed.example'))).rejects.toThrow(/不能采集/);
  const controller = new AbortController(); controller.abort();
  await expect(preparePublicRequest(new URL('https://feed.example'), { signal: controller.signal })).rejects.toThrow();
  expect(lookup).toHaveBeenCalledTimes(1);
});
it('压缩响应正常解码，传输及解码后的大小都受限制', async () => {
  const content = Buffer.from('公开订阅正文'.repeat(30));
  for (const [encoding, compress] of [['gzip', gzipSync], ['deflate', deflateSync], ['br', brotliCompressSync]] as const) {
    const response = Object.assign(Readable.from([compress(content)]), { headers: { 'content-encoding': encoding } }) as unknown as IncomingMessage;
    expect(Buffer.from(await readPublicBody(response, 2000, new AbortController().signal)).toString()).toBe(content.toString());
  }
  const oversized = Object.assign(Readable.from([gzipSync(content)]), { headers: { 'content-encoding': 'gzip' } }) as unknown as IncomingMessage;
  await expect(readPublicBody(oversized, 100, new AbortController().signal)).rejects.toThrow(/超过限制/);
});
