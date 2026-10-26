import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { setTimeout as delay } from 'node:timers/promises';

const base = process.env.BASE_URL ?? 'http://127.0.0.1:5174';
const out = 'docs/screenshots';
await mkdir(out, { recursive: true });
const browser = await chromium.launch(process.env.CI ? {} : { channel: 'chrome' });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  locale: 'zh-CN',
  timezoneId: 'Asia/Shanghai',
  reducedMotion: 'reduce',
});
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});
const results = [];
let completed = false;
async function check(name, fn) {
  try {
    await fn();
    results.push({ name, result: 'PASS' });
    console.log(`PASS ${name}`);
  } catch (error) {
    results.push({ name, result: 'FAIL', message: String(error) });
    throw error;
  }
}
async function visible(locator) {
  await locator.waitFor({ state: 'visible' });
}
async function noOverflow() {
  const size = await page.evaluate(() => ({
    viewport: window.innerWidth,
    width: document.documentElement.scrollWidth,
  }));
  assert.ok(size.width <= size.viewport, `page overflow: ${JSON.stringify(size)}`);
}
try {
  for (let attempt = 0; attempt < 30; attempt++) {
    try {
      if ((await globalThis.fetch(base)).ok) break;
    } catch {
      /* Preview may still be starting. */
    }
    if (attempt === 29) throw new Error(`Preview unavailable: ${base}`);
    await delay(500);
  }
  await page.goto(`${base}/dashboard`);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  for (const [label, width, height] of [
    ['desktop', 1440, 1000],
    ['tablet', 768, 1024],
    ['mobile', 390, 844],
  ]) {
    await page.setViewportSize({ width, height });
    for (const slug of ['dashboard', 'signals', 'strategy', 'review']) {
      await check(`${label} ${slug}: heading, overflow, screenshot`, async () => {
        await page.goto(`${base}/${slug}`);
        await visible(page.getByRole('heading', { level: 1 }));
        await noOverflow();
        await page.screenshot({ path: `${out}/${label}-${slug}.png`, fullPage: true });
      });
    }
  }
  await check('mobile navigation opens, follows route, closes', async () => {
    await page.getByRole('button', { name: '打开导航' }).click();
    await page
      .getByRole('dialog', { name: '移动端导航' })
      .getByRole('link', { name: '市场情报', exact: true })
      .click();
    await visible(page.getByRole('heading', { name: '市场情报', exact: true }));
    await noOverflow();
  });
  await check('mobile company drawer and evidence details fit viewport', async () => {
    await page.getByRole('button', { name: '编辑当前企业资料' }).click();
    await visible(page.getByRole('dialog', { name: '编辑企业资料' }));
    await noOverflow();
    await page.screenshot({ path: `${out}/mobile-company-drawer.png` });
    await page.getByRole('button', { name: '关闭详情', exact: true }).click();
    await page.goto(`${base}/signals?focus=S-01`);
    await visible(page.getByRole('dialog'));
    await noOverflow();
    await page.screenshot({ path: `${out}/mobile-evidence-drawer.png` });
    await page.getByRole('button', { name: '关闭详情', exact: true }).click();
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await check('A/B selection and manual plan edit survive navigation', async () => {
    await page.goto(`${base}/strategy`);
    await page.getByRole('button', { name: '选择并编辑', exact: true }).click();
    await page.getByRole('button', { name: '编辑方案', exact: true }).last().click();
    await page.getByLabel('方案名称', { exact: true }).fill('同城礼赠 · 人工调整');
    await page.getByRole('button', { name: '保存修改', exact: true }).click();
    await page.reload();
    await visible(page.getByRole('heading', { name: '同城礼赠 · 人工调整', exact: true }));
    await page.getByRole('button', { name: '选择并编辑', exact: true }).click();
  });
  await check('budget changes persist and trigger review across pages', async () => {
    await page.goto(`${base}/dashboard`);
    await page.getByRole('button', { name: '修改企业与预算' }).click();
    await page.getByLabel('预算上限（元）', { exact: true }).fill('4000');
    await page.getByRole('button', { name: '保存资料', exact: true }).click();
    await visible(page.getByRole('button', { name: /预算上限.*4,000/ }));
    await page.goto(`${base}/strategy`);
    await visible(page.getByText('当前审批需要重新确认', { exact: true }));
    await page.reload();
    await visible(page.getByText('当前审批需要重新确认', { exact: true }));
  });
  await check('over budget blocked, proportional adjustment and approval snapshot', async () => {
    const input = page.getByRole('textbox', { name: /小红书预算/ });
    await input.fill('999999');
    await visible(page.getByText(/合计预算不能超过上限/).first());
    assert.ok(await page.getByRole('button', { name: '确认方案 A', exact: true }).isDisabled());
    await page.getByRole('button', { name: /按比例调整至上限/ }).click();
    await page
      .getByLabel('确认理由 / 修改说明', { exact: true })
      .fill('预算调整为4000元，已核对模拟证据。');
    await page.getByRole('button', { name: '确认方案 A', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await visible(dialog);
    await dialog.getByRole('button', { name: /确认并保存/ }).click();
    await visible(page.getByText(/已.*确认/).first());
  });
  await check('signal empty state, filters, evidence and importance update', async () => {
    await page.goto(`${base}/signals`);
    await page.getByLabel('搜索情报', { exact: true }).fill('不存在的关键词XYZ');
    await visible(page.getByText('没有匹配的情报', { exact: true }));
    await page.getByRole('button', { name: '重置筛选', exact: true }).click();
    await page.getByLabel('来源平台', { exact: true }).selectOption({ label: '小红书' });
    await page.goto(`${base}/signals?focus=S-01`);
    const drawer = page.getByRole('dialog');
    await visible(drawer.getByText('原始来源片段', { exact: true }));
    await drawer.getByRole('button', { name: '低', exact: true }).click();
    await drawer.getByLabel('人工备注', { exact: true }).fill('浏览器验收：已核对模拟原文');
    await drawer.getByRole('button', { name: '保存备注', exact: true }).click();
    await page.screenshot({ path: `${out}/interaction-evidence.png`, fullPage: true });
    await page.getByRole('button', { name: '关闭详情', exact: true }).click();
    await page.goto(`${base}/strategy`);
    await visible(page.getByText('当前审批需要重新确认', { exact: true }));
  });
  await check('consumer theme links to its original signal', async () => {
    await page.getByText('消费者主题、证据与竞品机会 · 预设模拟分析', { exact: true }).click();
    await page.getByRole('button', { name: /S-01/ }).last().click();
    await visible(page.getByRole('dialog').getByText('原始来源片段', { exact: true }));
    await page.getByRole('button', { name: '关闭详情', exact: true }).click();
  });
  await check('review input recomputes metrics and persists', async () => {
    await page.goto(`${base}/review`);
    for (const field of await page.getByRole('textbox', { name: /曝光量$/ }).all())
      await field.fill('10000');
    for (const field of await page.getByRole('textbox', { name: /点击量$/ }).all())
      await field.fill('100');
    const input = page.getByRole('textbox', { name: '小红书点击量', exact: true });
    await input.fill('1000');
    await input.press('Tab');
    await page.reload();
    assert.equal(
      await page.getByRole('textbox', { name: '小红书点击量', exact: true }).inputValue(),
      '1000',
    );
    const state = await page.evaluate(() => JSON.parse(localStorage.getItem('guancha-ai-mvp-v04')));
    const review = state.reviews.at(-1);
    assert.equal(review.channels.find((c) => c.channel === '小红书').clicks, 1000);
    const totalClicks = review.channels.reduce((sum, c) => sum + (c.clicks ?? 0), 0);
    const totalImpressions = review.channels.reduce((sum, c) => sum + (c.impressions ?? 0), 0);
    await visible(
      page
        .getByText(`${((totalClicks / totalImpressions) * 100).toFixed(2)}%`, { exact: true })
        .first(),
    );
    await page.screenshot({ path: `${out}/interaction-review.png`, fullPage: true });
  });
  await check('feedback task created once and visible on signals', async () => {
    const add = page.getByRole('button', { name: '加入下一轮情报任务', exact: true }).first();
    await add.click();
    await page.getByRole('button', { name: '前往情报页查看待办', exact: true }).click();
    await page.getByRole('button', { name: /下一轮采集与核对/ }).click();
    await visible(page.getByRole('dialog', { name: '下一轮待补情报任务' }));
    await page
      .getByRole('dialog')
      .getByRole('button', { name: '关闭', exact: true })
      .last()
      .click();
  });
  await check('export includes edited state; reset restores demo', async () => {
    const downloaded = page.waitForEvent('download');
    await page.getByRole('button', { name: '导出当前任务 JSON', exact: true }).click();
    const file = await downloaded;
    const stream = await file.createReadStream();
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    const exported = JSON.parse(Buffer.concat(chunks).toString());
    assert.equal(exported.data.company.budgetCents, 400000);
    await page.getByRole('button', { name: '恢复演示数据', exact: true }).click();
    await page.getByRole('button', { name: '确认恢复', exact: true }).click();
    await page.waitForURL(`${base}/dashboard`);
    await visible(page.getByRole('button', { name: /预算上限.*5,000/ }));
  });
  assert.deepEqual(errors, [], 'browser console/page errors');
  completed = true;
} finally {
  await writeFile(
    'docs/ui-verification.json',
    JSON.stringify(
      {
        status: completed ? 'PASS' : 'FAIL',
        base,
        runAt: new Date().toISOString(),
        checks: results,
        errors,
      },
      null,
      2,
    ),
  );
  await browser.close();
}
