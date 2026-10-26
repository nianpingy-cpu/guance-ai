export function endpoint(value: string, allowLocal = true): URL {
  const url = new URL(value);
  if (url.username || url.password || url.hash || url.search) throw new Error('地址中不能包含账号、查询参数或片段');
  if (url.protocol !== 'https:' && !(allowLocal && url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname))) throw new Error('请使用HTTPS地址；本机服务可用HTTP');
  return url;
}
export async function checkedFetch(url: string | URL, init: RequestInit = {}, limit = 4_000_000): Promise<Response> {
  let response: Response;
  try { response = await fetch(url, { ...init, redirect: 'error', signal: init.signal ?? AbortSignal.timeout(30000) }); }
  catch { if (init.signal?.aborted) throw new Error('任务已取消或超时；未自动重试'); throw new Error('连接失败或超时，请检查地址、网络或证书；未自动重试'); }
  if (!response.ok) { await response.body?.cancel(); throw new Error(`HTTP ${response.status}：${response.status === 401 || response.status === 403 ? '凭据或权限无效' : response.status === 429 ? '请求频率受限，请稍后手动重试' : '服务返回错误'}；未自动重试`); }
  const reader = response.body?.getReader(); if (!reader) throw new Error('服务没有返回内容');
  const chunks: Uint8Array[] = []; let size = 0;
  while (true) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > limit) { await reader.cancel(); throw new Error('响应内容超过限制'); } chunks.push(value); }
  const bytes = new Uint8Array(size); let offset = 0; for (const c of chunks) { bytes.set(c, offset); offset += c.length; }
  return new Response(bytes, { headers: response.headers, status: response.status });
}
