# 第三方依赖与许可说明

本项目当前为内部桌面试用构建。演示项目使用虚构数据，真实项目可由用户导入或采集公开内容。第三方依赖遵循各自许可证，运行时依赖许可证文本收录于THIRD_PARTY_LICENSES.txt；Electron发行包另附其Chromium许可证。

## 视觉与图表参考

### Lieflat Charts

- 原版：<https://github.com/larashero3-dotcom/lieflat-charts>
- 扩展配色版：<https://github.com/komakizhu/lieflat-charts-custom>
- 许可证：**PolyForm Noncommercial License 1.0.0**
- 用途：本项目参考其 Glance / Lupi / Basics 三种视觉语言、MORANDI 高对比莫兰迪色板与发丝线/点阵/可数条形的图表语法，并使用 `color-presets.js` 中的公开色值作为设计参考。
- 说明：**未直接打包或复制其 HTML/SVG 模板代码**。本项目所有图表均为 React + 原生 SVG 重写，使用项目自身的数据契约、交互和空状态逻辑。
- 注意：PolyForm Noncommercial 仅允许非商业用途。若本项目未来用于商业产品、付费服务或商业投放，需要重新评估该参考与色板使用的许可安排。

## 运行时与开发依赖

| 依赖 | 用途 | 许可证 |
|---|---|---|
| React / React DOM | UI 运行时 | MIT |
| React Router | 四个一级页面路由 | MIT |
| Zustand | 跨页面状态与本地持久化 | MIT |
| Tailwind CSS | 设计 Token 与工具类 | MIT |
| Lucide React | 少量界面图标 | ISC |
| Vite | 开发与构建 | MIT |
| TypeScript | 类型检查 | Apache-2.0 |
| Vitest | 单元测试 | MIT |
| Playwright | 截图 / 录屏脚本 | Apache-2.0 |

## 字体

## v0.6新增运行时与交互参考

| 依赖/参考 | 用途 | 许可证 |
|---|---|---|
| Electron 45 | 桌面运行时、系统加密、独立进程 | MIT；Chromium等另附许可证 |
| Zod | 服务与导入边界校验 | MIT |
| Cheerio | 公开HTML正文提取 | MIT |
| fast-xml-parser | RSS/Atom、WebDAV XML解析 | MIT |
| Node.js内置SQLite | 本机持久化 | Node.js与SQLite自身许可，随Electron运行时分发 |
| electron-builder / esbuild | 开发期打包工具 | MIT |
| DeepSeek Harness | 仅参考服务商/模型配置的交互组织；未复制组件或截图资产 | MIT |

DeepSeek Harness参考：https://github.com/deepseek-ai/deepseek-harness 。v0.6应用图标为本项目SVG绘制，与侧栏品牌一致。模型、平台和WebDAV服务由用户选择，服务数据使用范围按其授权。

新增MIT许可证来自本机安装包LICENSE核查；下方v0.4/v0.5的Lieflat许可与色板来源说明作为历史记录保留。当前试用构建没有解除Lieflat原始非商业许可约束；若推进商业分发，应先完成相关参考素材与配色来源的许可处理。

v0.5 使用本机 Segoe UI / Microsoft YaHei / PingFang SC / 系统无衬线字体回退。不打包字体文件，不再请求 Google Fonts。

## 未引入的库

本项目**未**打包 ECharts、Chart.js、D3 或其他图表库。图表采用原生 SVG 手写实现，因此没有对应第三方图表运行时代码。第三方说明中提到的 Chart.js/ECharts 仅存在于 Lieflat Charts 参考仓库自身的模板中，与本项目产物无关。

## 数据与素材

- 演示企业“齐鲁茶研”、竞品名称、消费者评论、平台来源、投放结果均为虚构或模拟。
- 未使用真实企业 Logo、真实平台截图、真实个人信息或受版权保护的商业素材。
- 界面图标来自 Lucide（ISC），品牌图形为项目自行绘制的简单 SVG。

## v0.5 核实记录（2026-10-26）

两仓库的 README、SKILL.md、LICENSE 已重新读取。它们是面向代理的可视化 Skill 与 HTML/SVG 模板集合，没有本项目可直接安装的 React 组件接口；继续采用现有独立 SVG 实现。v0.5 按用户指定的海军蓝建立项目颜色角色，未复制模板源代码。

- [Lieflat Charts](https://github.com/larashero3-dotcom/lieflat-charts)：LICENSE 为 PolyForm Noncommercial License 1.0.0。
- [Lieflat Charts Custom](https://github.com/komakizhu/lieflat-charts-custom)：LICENSE 为 PolyForm Noncommercial License 1.0.0。

Lupi 用于逐日记录，Glance 用于可比较的主题排序，Basics 用于预算和计划/实际比较。图表共用一套项目色彩角色；状态另外用文字标注。原 v0.4 的色板来源说明保留用于基线追溯。
