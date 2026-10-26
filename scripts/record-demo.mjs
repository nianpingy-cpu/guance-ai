import { mkdir, rename } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const base = process.env.BASE_URL ?? 'http://127.0.0.1:4173';
const outDir = fileURLToPath(new URL('../docs/demo/', import.meta.url));
await mkdir(outDir, { recursive: true });

const browser = await chromium.launch({ channel: 'chrome' });
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  locale: 'zh-CN',
  recordVideo: { dir: outDir, size: { width: 1440, height: 900 } },
});
const page = await context.newPage();
const wait = (ms) => page.waitForTimeout(ms);

async function caption(text) {
  await page.evaluate((value) => {
    let node = document.getElementById('demo-caption');
    if (!node) {
      node = document.createElement('div');
      node.id = 'demo-caption';
      node.style.cssText = [
        'position:fixed', 'left:50%', 'bottom:24px', 'transform:translateX(-50%)',
        'z-index:99999', 'pointer-events:none', 'background:rgba(23,32,51,.92)',
        'color:#fff', 'padding:10px 16px', 'border-radius:12px',
        'font:600 13px/1.5 Inter,"Noto Sans SC",sans-serif',
        'box-shadow:0 12px 30px -12px rgba(0,0,0,.5)', 'max-width:920px',
        'border-left:3px solid #9BE6C0', 'letter-spacing:.01em',
      ].join(';');
      document.body.appendChild(node);
    }
    node.textContent = value;
  }, text);
}

await page.goto(`${base}/dashboard`, { waitUntil: 'networkidle' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle' });
await page.evaluate(() => document.fonts.ready);
await wait(1200);
await caption('工作台：本轮预算、重点信号与下一步操作一屏可见');
await wait(2600);

await page.getByRole('link', { name: /市场情报/ }).click();
await wait(900);
await caption('市场情报：按平台、优先级与状态筛选可追溯信号');
await wait(2200);
await page.getByLabel('搜索情报').fill('担心');
await wait(900);
await page.getByText('担心“包装好看但茶叶一般”', { exact: true }).click();
await wait(900);
await caption('详情抽屉：事实、分析判断与待核实信息分开展示');
await wait(1800);
await page.locator('#signal-note').fill('已核对来源，需补充产品检测或产地证明后再用于对外内容。');
await page.getByRole('button', { name: '保存备注' }).click();
await wait(500);
await page.getByRole('dialog').getByRole('button', { name: '已核实', exact: true }).click();
await wait(900);
await caption('标记已核实：工作台统计与审批依据状态同步变化');
await wait(1600);
await page.getByRole('dialog').getByRole('button', { name: '关闭详情' }).click();
await wait(400);

await page.getByRole('link', { name: /工作台/ }).click();
await wait(900);
await caption('关键证据变化后，已审批方案提示“需要重新确认”');
await wait(2200);

await page.getByRole('link', { name: /洞察与策略/ }).click();
await wait(1000);
await page.getByRole('button', { name: /确认方案 A/ }).click();
await wait(800);
await caption('确认方案：预算合规、理由完整后保存审批快照');
await wait(1800);
await page.getByRole('dialog').getByRole('button', { name: '确认并保存快照' }).click();
await wait(800);
await page.getByRole('button', { name: '进入效果复盘' }).click();
await wait(900);
await caption('效果复盘：录入演示实际数据后，指标与图表自动重算');
await wait(1800);

const fields = [
  ['小红书实际花费', '1980'], ['小红书曝光量', '46000'], ['小红书点击量', '1150'], ['小红书有效咨询', '31'],
  ['抖音实际花费', '1760'], ['抖音曝光量', '61400'], ['抖音点击量', '1540'], ['抖音有效咨询', '34'],
  ['微信社群实际花费', '1120'], ['微信社群曝光量', '21000'], ['微信社群点击量', '430'], ['微信社群有效咨询', '17'],
];
for (const [label, value] of fields) {
  const input = page.getByLabel(label);
  await input.fill(value);
  await wait(90);
}
await wait(1200);
await page.mouse.wheel(0, 900);
await wait(1600);
await caption('计划与实际、渠道效率分别使用合适单位，缺失值不按 0 处理');
await wait(2000);

await page.mouse.wheel(0, 1300);
await wait(1000);
await page.getByRole('button', { name: '加入下一轮情报任务' }).first().click();
await wait(900);
await caption('复盘结论转化为下一轮情报任务');
await wait(1500);
await page.mouse.wheel(0, 1100);
await wait(900);
await page.getByRole('link', { name: /市场情报/ }).click();
await wait(1000);
await caption('情报页出现新的待补任务，业务闭环完成');
await wait(2200);

const video = page.video();
await context.close();
await browser.close();
if (video) {
  const raw = await video.path();
  const target = `${outDir}guance-ai-demo.webm`;
  await rename(raw, target);
  console.log('saved docs/demo/guance-ai-demo.webm');
}
