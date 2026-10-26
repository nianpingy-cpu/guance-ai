import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
const lock = JSON.parse(await readFile('package-lock.json', 'utf8')); const chunks = ['GuanceAI v0.6 third-party runtime notices. Electron/Chromium notices are also included with the Electron distribution.\n'];
for (const [path, info] of Object.entries(lock.packages)) {
  if (!path.startsWith('node_modules/') || info.dev) continue;
  const names = await readdir(path).catch(() => []); const license = names.find((n) => /^licen[cs]e(?:\.|$)/i.test(n));
  chunks.push(`\n${'='.repeat(72)}\n${path} ${info.version} | ${info.license ?? 'see package notice'}\n${license ? await readFile(join(path, license), 'utf8') : 'See the package metadata and upstream repository for its license notice.'}\n`);
}
await writeFile('THIRD_PARTY_LICENSES.txt', chunks.join('\n'));
