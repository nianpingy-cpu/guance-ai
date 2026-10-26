import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const base = process.env.BASE_URL ?? 'http://127.0.0.1:4173';
const outDir = fileURLToPath(new URL('../docs/screenshots/', import.meta.url));
await mkdir(outDir, { recursive: true });

const browser = await chromium.launch({ channel: 'chrome' });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  deviceScaleFactor: 1,
  locale: 'zh-CN',
});
const page = await context.newPage();
await page.goto(`${base}/dashboard`, { waitUntil: 'networkidle' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle' });
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(900);

const pages = [
  ['dashboard', '工作台'],
  ['signals', '市场情报'],
  ['strategy', '洞察与策略'],
  ['review', '效果复盘'],
];

for (const [slug] of pages) {
  await page.goto(`${base}/${slug}`, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(700);
  await page.screenshot({
    path: `${outDir}${slug}.png`,
    fullPage: true,
  });
  console.log(`saved docs/screenshots/${slug}.png`);
}

// A smaller viewport is included to show the no-overflow layout.
await context.close();
const mobile = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 1,
  locale: 'zh-CN',
});
const mobilePage = await mobile.newPage();
for (const [slug] of pages) {
  await mobilePage.goto(`${base}/${slug}`, { waitUntil: 'networkidle' });
  await mobilePage.evaluate(() => document.fonts.ready);
  await mobilePage.waitForTimeout(500);
  await mobilePage.screenshot({
    path: `${outDir}mobile-${slug}.png`,
    fullPage: true,
  });
  console.log(`saved docs/screenshots/mobile-${slug}.png`);
}

await browser.close();
