import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';

const base = 'http://127.0.0.1:5173';
const out = fileURLToPath(new URL('../../doc-assets/v04/', import.meta.url));
const browser = await chromium.launch({ channel: 'chrome' });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2, locale: 'zh-CN' });
const page = await context.newPage();
await page.goto(`${base}/dashboard`, { waitUntil: 'networkidle' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle' });
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(1000);

const shot = async (name) => {
  await page.screenshot({ path: `${out}${name}.png` });
  console.log(name);
};

await shot('dashboard-top');

await page.goto(`${base}/signals`, { waitUntil: 'networkidle' });
await page.waitForTimeout(700);
await shot('signals-top');
await page.goto(`${base}/signals?focus=S-01`, { waitUntil: 'networkidle' });
await page.waitForTimeout(800);
await shot('signal-drawer');

await page.goto(`${base}/strategy`, { waitUntil: 'networkidle' });
await page.waitForTimeout(700);
await shot('strategy-top');
await page.getByText('营销策略决策', { exact: true }).scrollIntoViewIfNeeded();
await page.waitForTimeout(600);
await shot('strategy-decision');

await page.goto(`${base}/review`, { waitUntil: 'networkidle' });
await page.waitForTimeout(700);
await shot('review-top');
await page.getByText('实际数据录入', { exact: true }).scrollIntoViewIfNeeded();
await page.waitForTimeout(600);
await shot('review-data');

await page.goto(`${base}/strategy?view=approval`, { waitUntil: 'networkidle' });
await page.waitForTimeout(900);
await shot('approval-modal');

await context.close();
const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: 'zh-CN' });
const mp = await mobile.newPage();
await mp.goto(`${base}/dashboard`, { waitUntil: 'networkidle' });
await mp.waitForTimeout(700);
await mp.screenshot({ path: `${out}mobile-dashboard.png` });
console.log('mobile-dashboard');
await browser.close();
