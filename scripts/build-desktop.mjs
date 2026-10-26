import { build } from 'esbuild';
import { resolve } from 'node:path';
await build({ entryPoints: ['desktop/main.ts', 'desktop/preload.ts', 'desktop/worker.ts'], outdir: 'desktop-dist', outExtension: { '.js': '.cjs' }, bundle: true, platform: 'node', format: 'cjs', target: 'node24', external: ['electron'], alias: { '@': resolve('src') } });
