import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
const base = process.env.BASE_URL ?? 'http://127.0.0.1:5174';
const out = 'docs/typography';
await mkdir(out, { recursive: true });
const browser = await chromium.launch(process.env.CI ? {} : { channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce', locale: 'zh-CN' });
const fonts = new Set();
page.on('request', (request) => { if (request.resourceType() === 'font') fonts.add(request.url()); });
const results = [];
try {
  for (const route of ['dashboard', 'signals', 'strategy', 'review']) {
    await page.goto(`${base}/${route}`);
    await page.getByRole('heading', { level: 1 }).waitFor();
    await page.evaluate(() => document.fonts.ready);
    const typography = await page.evaluate(() => {
      const h1 = document.querySelector('h1');
      const style = window.getComputedStyle(h1);
      return {
        family: style.fontFamily, titleWeight: style.fontWeight, titleSize: style.fontSize,
        titleTracking: style.letterSpacing, bodyWeight: window.getComputedStyle(document.body).fontWeight,
        loadedFaces: [...document.fonts].filter((font) => font.status === 'loaded').map((font) => ({ family: font.family, weight: font.weight })),
        cjkAndLatinReady: document.fonts.check('14px "Noto Sans SC Variable"', '观策AI0123'),
      };
    });
    assert.ok(typography.family.startsWith('"Noto Sans SC Variable"'));
    assert.ok(typography.loadedFaces.some((font) => font.family.includes('Noto Sans SC Variable')));
    assert.equal(typography.cjkAndLatinReady, true);
    results.push({ route, ...typography });
    await page.screenshot({ path: `${out}/after-${route}.png`, fullPage: true });
  }
  assert.ok(fonts.size > 0);
  assert.ok([...fonts].every((url) => new URL(url).origin === new URL(base).origin), '字体必须随应用本地加载');
  await writeFile(`${out}/results.json`, JSON.stringify({ at: new Date().toISOString(), localFontRequests: fonts.size, results }, null, 2));
  console.log('PASS 4 typography views; bundled CJK/Latin font loaded, no external font request');
} finally { await browser.close(); }
