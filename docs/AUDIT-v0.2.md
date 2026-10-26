# v0.2 源码审计与迁移说明

审计日期：2026-10-23  
审计对象：`../观策AI-MVP/`（`index.html`、`app.js`、`style.css`、`典型案例备份.json`、验收记录）  
迁移目标：`观策AI-WebMVP-v0.4`

## 1. 原工程事实

- 原生 HTML + CSS + 一个约 23KB 的 IIFE（`app.js`），无构建工具、无包管理器。
- 五步单页流程：M1 企业画像 → M2 来源与证据 → M3 洞察 → M4 审批 → M5 结果与回流任务。
- 数据写入 `localStorage`，key 为 `guance-mvp-v2`；包含较完整的结构校验、导入校验和审计日志。
- 预算以“分”为整数单位，方案总额不得高于企业预算；审批快照保存方案、画像、证据 ID 与洞察 ID。
- 证据/洞察/方案变更会使旧审批失效；结果按渠道记录；任务可完成/重开。
- CSV 支持三列渠道报表导入；JSON 支持整包恢复；也能导出 Markdown 报告。
- 视觉为蓝白/卡片式单页，工程编号 M1–M5 直接暴露在界面上。

## 2. 复用清单

| 原能力 | 处理 | v0.4 实现 |
|---|---|---|
| 企业档案录入与预算上限 | 保留并重构 | `CompanyDrawer` + 全局企业状态；预算上限联动方案校验 |
| 企业预算以整数分存储 | 保留 | `budgetCents` / `formatCny` / `parseYuanToCents` |
| 方案总额 ≤ 预算上限 | 保留并强化 | `checkPlanBudget`；渠道输入即时拒绝超限；确认前再次校验 |
| 审批快照 | 保留并重构 | `ApprovalSnapshot` 保存方案副本、预算、确认理由、证据状态、指纹与时间 |
| 变更导致审批失效 | 保留并重构 | `buildPlanFingerprint` + `getApprovalHealth` 派生 `valid / needs-reconfirm / hold / none` |
| 效果按渠道回填 | 保留并扩展 | `Review.channels` 含花费、曝光、点击、咨询；自动计算 CTR/CPC/咨询成本 |
| 反馈任务回流 | 保留并扩展 | `FeedbackTask` 在情报页显示、可完成/重开、可由复盘一键创建 |
| localStorage 持久化 | 保留并重构 | Zustand persist + 版本号 + 结构校验；刷新保留 |
| JSON 导出 | 保留 | 侧栏“导出当前任务 JSON” |
| 整包 JSON 恢复 | 替换 | 以“恢复演示数据”一键还原，避免坏数据破坏演示；单项情报支持 JSON/CSV 导入 |
| 渠道报表 CSV 导入 | 放弃 | 本轮需求以“情报导入 + 复盘逐渠道录入”为主；避免两套报表入口 |
| 规则预算草案（80% 历史咨询效率 + 20% 探索） | 不迁入 | v0.4 要求 A/B 两套实质不同的候选方案，预算由人工比较和编辑；未接入真实历史效率时继续自动生成会制造“伪模型预测” |
| 本地审计日志 | 不迁入 | 审批快照、确认时间、指纹与复盘记录已能支撑演示追溯；无后端时日志不具备可信审计意义 |
| M1–M5 工程编号 | 删除 | 合并为四个一级页面，界面只使用业务名称 |
| 原生 DOM 渲染与内联 HTML 字符串 | 删除 | React 组件、TypeScript 类型、统一 UI 组件与图表组件 |

## 3. 迁移后的数据契约

```
Company
  └─ Campaign（通过 company.campaignStart / campaignEnd 表达）
Source ──< Signal
InsightTheme ──< Signal（evidenceSignalIds）
OpportunityCard ──< Signal
Plan ──< PlanChannel
ApprovalSnapshot（Plan + Company 预算 + 证据状态 + fingerprint）
Review ──< ReviewChannelActual
FeedbackTask ──< Signal
DecisionState（approved / pending / hold）
```

关键规则：

1. `sum(plan.channels.budgetCents) <= company.budgetCents`。
2. `ApprovalSnapshot.fingerprint` 由企业预算、方案全部文本与渠道预算、关联情报的优先级/状态/相关性共同生成。
3. 任一输入发生变化，`getApprovalHealth` 返回 `needs-reconfirm`；旧快照仍保留。
4. 只有确认后的方案可以进入复盘录入；复盘始终关联审批快照中的方案副本。
5. 缺失的复盘字段为 `null`，聚合指标在任一渠道缺失时返回 `null`，不静默当作 0。

## 4. 设计迁移

- 采用浅色背景、白色卡片、品牌深蓝、薄荷绿强调、莫兰迪数据色。
- 四个一级路由：`/dashboard`、`/signals`、`/strategy`、`/review`。
- 原工程的“当前步骤/下一步”改为工作台任务阶段进度与顶部状态胶囊。
- 原工程“人工审批”改为 A/B 方案对照 + 预算编辑 + 确认理由 + 快照查看。
- 图表由原生 SVG 重写为 React 组件，不直接复制 Lieflat Charts 模板代码。

## 5. 保留的风险与边界

- 仍是纯前端演示，没有后端、真实鉴权、真实平台 API、真实大模型或数据库。
- 浏览器 localStorage 可被本机用户修改，不是可信审计存储。
- 演示时间采用“演示时钟”：新操作时间不早于 `2026-11-03T09:30+08:00`，以确保新审批快照排序在种子快照之后。
- Lieflat Charts 为视觉语言参考，其仓库使用 PolyForm Noncommercial 1.0.0；本项目未打包其代码，但如用于商业用途需重新评估许可。
