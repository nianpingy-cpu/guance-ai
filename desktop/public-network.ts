import { lookup } from 'node:dns/promises';
import { isIP, type LookupFunction } from 'node:net';
import { request as httpRequest, type IncomingMessage } from 'node:http';
import { request as httpsRequest, type RequestOptions } from 'node:https';
import { Buffer } from 'node:buffer';
import { PassThrough, Transform, Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createGunzip, createInflate, createBrotliDecompress } from 'node:zlib';

/** Public collection is intentionally separate from user-configured model/WebDAV endpoints. */
export function isNonPublicAddress(value: string): boolean {
  const ip = value.toLowerCase().replace(/^\[|\]$/g, '');
  const family = isIP(ip);
  if (family === 4) {
    const [a, b, c] = ip.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 168 || (b === 0 && (c === 0 || c === 2)) || (b === 88 && c === 99))) || (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) || (a === 203 && b === 0 && c === 113);
  }
  if (family !== 6) return true;
  // Expand the standard IPv6 forms before examining mapped IPv4 bytes.
  let expanded = ip;
  if (ip.includes('.')) {
    const index = ip.lastIndexOf(':'); const bytes = ip.slice(index + 1).split('.').map(Number);
    expanded = ip.slice(0, index + 1) + ((bytes[0] << 8) | bytes[1]).toString(16) + ':' + ((bytes[2] << 8) | bytes[3]).toString(16);
  }
  const [left, right] = expanded.split('::');
  const first = left ? left.split(':') : []; const last = right ? right.split(':') : [];
  const words = (right === undefined ? first : [...first, ...Array(8 - first.length - last.length).fill('0'), ...last]).map((part) => parseInt(part, 16));
  if (words.slice(0, 5).every((word) => word === 0) && words[5] === 0xffff) return isNonPublicAddress(`${words[6] >> 8}.${words[6] & 255}.${words[7] >> 8}.${words[7] & 255}`);
  // Allow native global unicast; exclude documentation and transition/special ranges.
  if ((words[0] & 0xe000) !== 0x2000 || words[0] === 0x2002) return true;
  return words[0] === 0x2001 && (words[1] === 0x0db8 || words[1] === 0 || words[1] === 2 || (words[1] >= 0x10 && words[1] <= 0x2f));
}

type PublicOptions = { signal?: AbortSignal; headers?: Record<string, string> };
export async function preparePublicRequest(url: URL, init: PublicOptions = {}): Promise<RequestOptions> {
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('采集仅支持无凭据的公开HTTP/HTTPS地址');
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  const family = isIP(hostname);
  init.signal?.throwIfAborted();
  const addresses = family ? [{ address: hostname, family }] : await new Promise<Array<{ address: string; family: number }>>((resolve, reject) => {
    const aborted = () => reject(new Error('任务已取消或超时；未自动重试'));
    init.signal?.addEventListener('abort', aborted, { once: true });
    lookup(hostname, { all: true, verbatim: true }).then(resolve, reject).finally(() => init.signal?.removeEventListener('abort', aborted));
  });
  init.signal?.throwIfAborted();
  if (!addresses.length || addresses.some((entry) => isNonPublicAddress(entry.address) || isIP(entry.address) !== entry.family)) throw new Error('不能采集本机、私有网络或保留地址');
  const pinnedLookup: LookupFunction = (requested, options, callback) => {
    const choices = addresses.filter((entry) => !options.family || options.family === entry.family);
    if (requested.toLowerCase() !== hostname.toLowerCase() || !choices.length) { callback(new Error('来源地址校验失败'), '', 4); return; }
    if (options.all) callback(null, choices); else callback(null, choices[0].address, choices[0].family);
  };
  // Keep the original host for HTTP Host, SNI and certificate verification.
  // Only DNS lookup is replaced; the transport cannot resolve the host again.
  return { hostname, method: 'GET', agent: false, lookup: pinnedLookup, rejectUnauthorized: true, signal: init.signal, headers: { 'accept-encoding': 'gzip, deflate, br', ...init.headers } };
}

export async function readPublicBody(response: IncomingMessage, limit: number, signal: AbortSignal): Promise<Uint8Array<ArrayBuffer>> {
  const encoding = String(response.headers['content-encoding'] ?? 'identity').toLowerCase().trim();
  const decoder = encoding === 'gzip' ? createGunzip() : encoding === 'deflate' ? createInflate() : encoding === 'br' ? createBrotliDecompress() : encoding === 'identity' ? new PassThrough() : null;
  if (!decoder) { response.destroy(); throw new Error('来源使用暂不支持的压缩格式'); }
  let wireSize = 0; let decodedSize = 0; const chunks: Buffer[] = [];
  const guard = new Transform({ transform(chunk: Buffer, _encoding, callback) { wireSize += chunk.length; callback(wireSize > limit ? new Error('响应内容超过限制') : null, chunk); } });
  const output = new Writable({ write(chunk: Buffer, _encoding, callback) { decodedSize += chunk.length; if (decodedSize > limit) { callback(new Error('响应内容超过限制')); return; } chunks.push(chunk); callback(); } });
  await pipeline(response, guard, decoder, output, { signal });
  return new Uint8Array(Buffer.concat(chunks));
}

export async function checkedPublicFetch(url: URL, init: PublicOptions = {}, limit = 5_000_000): Promise<Response> {
  const signal = init.signal ?? AbortSignal.timeout(30000);
  try {
    const options = await preparePublicRequest(url, { ...init, signal });
    const response = await new Promise<IncomingMessage>((resolve, reject) => {
      const request = (url.protocol === 'https:' ? httpsRequest : httpRequest)(url, options, resolve);
      request.once('error', reject); request.end();
    });
    const status = response.statusCode ?? 502;
    if (status < 200 || status >= 300) { response.destroy(); throw new Error(`HTTP ${status}：${status >= 300 && status < 400 ? '来源发生重定向，请填写最终公开链接' : '来源返回错误'}；未自动重试`); }
    const bytes = await readPublicBody(response, limit, signal);
    const headers = new Headers();
    for (const [name, value] of Object.entries(response.headers)) { if (name === 'content-encoding' || name === 'content-length') continue; for (const entry of Array.isArray(value) ? value : value ? [value] : []) headers.append(name, entry); }
    return new Response([204, 205].includes(status) ? null : bytes, { status, headers });
  } catch (error) {
    if (signal.aborted) throw new Error('任务已取消或超时；未自动重试', { cause: error });
    if (error instanceof Error && /^(不能采集|采集仅支持|来源使用|来源地址校验|响应内容超过|HTTP )/.test(error.message)) throw error;
    throw new Error('连接失败或超时，请检查公开地址、网络或证书；未自动重试', { cause: error });
  }
}
