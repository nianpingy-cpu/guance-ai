import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const base = process.env.BASE_URL ?? 'http://127.0.0.1:5174';
const out = process.env.VISUAL_OUT ?? 'docs/visual';
await mkdir(out, { recursive: true });
const browser = await chromium.launch(process.env.CI ? {} : { channel: 'chrome' });
const page = await browser.newPage({ reducedMotion: 'reduce', locale: 'zh-CN', timezoneId: 'Asia/Shanghai' });
const results = [];
try {
  for (const [width, height] of [[1440, 900], [1366, 768], [1280, 800], [1024, 768], [768, 1024], [390, 844]]) {
    await page.setViewportSize({ width, height });
    for (const zoom of [1, 1.25, 1.5]) {
      for (const slug of ['dashboard', 'signals', 'strategy', 'review']) {
        await page.goto(`${base}/${slug}`);
        await page.getByRole('heading', { level: 1 }).waitFor();
        await page.evaluate((scale) => { document.documentElement.style.zoom = String(scale); document.querySelectorAll('details').forEach((d) => { d.open = true; }); }, zoom);
        await page.evaluate(() => document.fonts.ready);
        const failures = await page.evaluate(() => {
          const failures = [];
          for (const svg of document.querySelectorAll('svg.chart-svg')) {
            if (!svg.checkVisibility()) continue;
            const labels = Array.from(svg.querySelectorAll('text')).map((el) => ({ text: el.textContent, box: el.getBoundingClientRect() })).filter((x) => x.box.width && x.box.height);
            labels.forEach((a, i) => labels.slice(i + 1).forEach((b) => {
              const w = Math.min(a.box.right, b.box.right) - Math.max(a.box.left, b.box.left);
              const h = Math.min(a.box.bottom, b.box.bottom) - Math.max(a.box.top, b.box.top);
              if (w > 1 && h > 1) failures.push({ chart: svg.getAttribute('aria-label'), a: a.text, b: b.text });
            }));
          }
          if (document.documentElement.scrollWidth > window.innerWidth + 1) failures.push({ overflow: document.documentElement.scrollWidth, viewport: window.innerWidth });
          return failures;
        });
        const name = `${width}-${zoom}-${slug}`;
        if (zoom === 1 || failures.length) await page.screenshot({ path: `${out}/${name}.png`, fullPage: true });
        results.push({ name, failures });
      }
    }
  }
  await writeFile(`${out}/results.json`, JSON.stringify(results, null, 2));
  assert.equal(results.filter((r) => r.failures.length).length, 0, JSON.stringify(results.filter((r) => r.failures.length).slice(0, 5), null, 2));
  console.log(`PASS ${results.length} expanded-page layout checks`);
} finally { await browser.close(); }
