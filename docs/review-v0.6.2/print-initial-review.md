# 策略与复盘 A4 打印验收

2026-10-29（Asia/Shanghai）。**结论：REQUEST CHANGES，复盘打印存在 P2 表格裁切。** 本报告只记录既有 source build 0.6.2 的打印结果，未修改工程或重新构建。

## 运行与证据

- Electron 45.0.0，应用 `0.6.2`、`isPackaged=false`；使用既有 `dist` 和 `desktop-dist`，`args=['.']`。
- 每次应用使用新建 `GUANCE_TEST_DATA` 临时目录；只读取该目录中初始化的单个演示项目。全程未保存业务修改，打印前后项目 revision 一致。
- 策略五个 details、复盘一个 details 全部展开；等待离线字体和所有有限 CSS 动画完成后导出。显式使用 print 媒体，避免 screen 媒体覆盖影响验收。
- `webContents.printToPDF`：A4 竖向、四边 10mm、scale 1、打印背景、无页眉页脚，未调用系统打印机。PDF 为本轮中间验证，不是替换工程导出能力。
- `strategy-a4.pdf` 共 8 页；`review-a4.pdf` 共 5 页。两份 PDF 全部由已配置 Poppler 在 100 dpi 渲染，并逐页目视检查；`pypdf`/`pdfplumber` 辅助核对页数、文本与边界。未安装软件。
- 最终渲染文件只认 `final-strategy-1.png` 至 `final-strategy-8.png`、`final-review-1.png` 至 `final-review-5.png`。未带 final 前缀的早期渲染属于检查过程，不作当前结论证据。
- 自动化记录：`print-results.json`；PDF 检查记录：`pdf-inspection.json`；复现脚本：`export-print.mjs`、`inspect-print.py`。目录均为 `task/work/print-check`。

## P2：复盘九列表格右侧三列被打印裁切

- 具体证据：`review-a4.pdf` **第 1 页**；代表渲染 `final-review-1.png`。
- 页面可完整看到渠道、计划预算、实际花费、曝光量、点击量和有效咨询；CTR 只露出左边缘，CPC 与咨询成本列不可见，三行对应值也不完整。页面仍画出横向滚动条，纸面无法滚动查看隐藏内容。
- 原始结构位于 `src/pages/ReviewPage.tsx:285` 的 `min-w-[900px]` 表格，父层 `overflow-x-auto`。`src/styles/global.css:707` 起的打印规则没有调整该最小宽度/滚动裁切。
- 在模拟 A4 可打印宽度约 718px 的 print 媒体布局中，实际表宽 900px、滚动容器宽 701px。列坐标为 CTR 708.20–770.55、CPC 770.55–827.59、咨询成本 827.59–901px，超出可见裁切区。
- PDF 文本抽取仍能找到隐藏的九个表头，因此“提取到了文本”不能作为打印完整证明；本结论依据实际 PDF 渲染。
- 建议修复方向：仅打印样式下解除表格/滚动容器裁切并使九列适应页面，或采用明确的打印表格布局；保留单位和所有三行指标。修复后必须重新生成并目视核对同页右侧三列，不能仅检查 DOM 或文本抽取。

## 其他实际观察

- **字体与单位：本演示数据通过。** 已核对策略 p1–3 的金额/预算、复盘 p1 的金额/曝光/点击/咨询单位；中文和货币符号正常，无重叠或方框字。
- **图表标签：本轮稳定状态通过。** 策略 p2 预算堆条、p4 五个主题排序、p5 证据质量；复盘 p4 计划/实际花费、p5 CTR/CPC/咨询成本分项。标题、副说明、单位、图例、行/渠道标签和数值在当前演示长度下均完整可读，没有横向裁切或重叠。代表图 `final-strategy-2.png`、`final-strategy-4.png`、`final-strategy-5.png`、`final-review-4.png`、`final-review-5.png`。
- **P3：打印包含模型选择控件与低信息尾页。** 全展开时策略 p7 打印模型配置按钮、搜索框与有内部滚动条的情报选择器；p8 仅顶部少量截断的选择器内容、灰色生成按钮及大块空白（`final-strategy-7.png`、`final-strategy-8.png`）。选择器只打印当前滚动视口，无法作为完整证据清单。可将此类交互区域在打印中隐藏或改为静态摘要；不影响上述 P2 的独立复现。
- 卡片普遍保持不跨页，因此部分页有明显留白；当前未把纯留白本身计作阻断。

## 文件摘要

| 文件 | 大小 | SHA-256 |
|---|---:|---|
| strategy-a4.pdf | 2,243,763 bytes | `9b7ad1138c3271b17fc138d7139d7c333680dd4db780475653089917598c989e` |
| review-a4.pdf | 1,618,385 bytes | `7b54c3a95d0f442342bf0257701df1ab791511f0a3ac699cecb9239a309eb381` |

本轮没有读取用户正常 AppData、模型配置或密钥，没有触发模型、采集、同步或付费网络；没有操作打印机，没有改工程源码、package 或 Git 提交。未覆盖长文本、手工系统打印机驱动、其他纸型或 macOS 打印输出，不将其视作已通过。
