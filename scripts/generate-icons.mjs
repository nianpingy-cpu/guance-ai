import { chromium } from 'playwright';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { Buffer } from 'node:buffer';
const browser = await chromium.launch({ channel: 'chrome' });
try { const page = await browser.newPage(); const svg = await readFile('public/icon.svg', 'utf8');
  await page.setViewportSize({ width: 512, height: 512 }); await page.setContent(`<style>body{margin:0}svg{display:block;width:100%;height:100%}</style>${svg}`); await page.screenshot({ path: 'public/icon.png', omitBackground: true });
  await page.setViewportSize({ width: 256, height: 256 }); const png = await page.screenshot({ omitBackground: true }); const header = Buffer.alloc(22); header.writeUInt16LE(1, 2); header.writeUInt16LE(1, 4); header.writeUInt16LE(1, 10); header.writeUInt16LE(32, 12); header.writeUInt32LE(png.length, 14); header.writeUInt32LE(22, 18); await mkdir('build', { recursive: true }); await writeFile('build/icon.ico', Buffer.concat([header, png]));
} finally { await browser.close(); }
