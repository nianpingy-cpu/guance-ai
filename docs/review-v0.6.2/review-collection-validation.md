# 独立审查：采集、任务、模型与验收证据

审查时间：2026-10-28。仓库审查基线18888c4e1c6c4e82d513595082a4e2febba73e96，应用代码a7220cff4b569c2cfb09e97f003de93f56c59774；交付outputs/guance-ai-trial-v0.6.1。结论：**REQUEST CHANGES**。以下是本次只读审查结论，后续修复不改写这里的原始证据。

## BLOCKING（本次通过前应修复，严重程度P2）

### C1. JSON数组中的null会取消整个文件的逐行预览

- 位置：`outputs/guance-ai/src/lib/importSignals.ts:123–127`直接将未知数组断言为记录数组；`:172–175`逐行调用；`:64–66`未判空访问属性。`src/features/signals/ImportModal.tsx:68–74`把异常误报为编码/文件读取失败。
- 触发：导入`[null,{"title":"有效记录","platform":"公开资料","category":"industry","publishedAt":"2026-10-28","summary":"有效摘要"}]`，或将null放在有效行后面。
- 期望：有效行仍可预览/导入1条，null行报告类型错误1条。实际：抛出`TypeError: Cannot read properties of null (reading '标题')`，整个文件有效行也不可预览。该行单独导入成功1条。这是已复现功能缺陷，不是仅缺测试。
- 影响：数据源常见的空项使批量文件无法使用，且提示方向错误；未观察到已保存数据受损。
- 建议：对每个JSON项做对象/非null/非数组校验，按行报错并继续；补null在首尾的回归。

### C2. Atom XHTML正文被丢弃，零有效结果仍自动关闭复盘待办

- 位置：`outputs/guance-ai/desktop/collect.ts:35`只抽取标量或`#text`；`:60`未解析内联XML子树；`:70`将因此变空的正文跳过；`:78`无条件把关联反馈任务设为done。
- 触发：Atom entry含`<content type="xhtml"><div xmlns="http://www.w3.org/1999/xhtml"><p>应当保留的完整正文</p></div></content>`。隔离fixture包含feed/entry的id,title,updated及feed author。该正文形式由[Atom RFC4287 4.1.3.3–4](https://www.rfc-editor.org/rfc/rfc4287#section-4.1.3.3)定义。
- 实际：文本content控制组新增1条；XHTML组任务completed、显示读取1条新增0条，signals/sources都为空；混合2条只新增文本1条。关联`FT-review`最初open，XHTML组没有任何情报仍变为done。
- 影响：有效订阅内容静默漏采，补充证据的业务任务可能在没有结果时错误完成。
- 建议：按Atom的text/html/xhtml构造抽取正文，保留子树文本；区分重复/无正文/不支持格式，零有效结果明确反馈并保留待办。补混合正文及关联任务回归。

## NON-BLOCKING

1. `src/features/signals/ImportModal.tsx:187`仍称“写入当前演示数据”，底部文字仍称导入默认演示来源、真实采集不在本版范围；实际`simulated`已按业务/演示项目切换，业务来源是manual。文案与本版实现不一致，应更新；未观察到实际来源被错误标为模拟。
2. 测试覆盖应按实际断言描述：`desktop/collect.test.ts`仅2项，综合项标题包含“应用中断保留任务”，主体未中断/重建Jobs、未取消/重试、未测Atom/DTD/限流；`desktop/models.test.ts`4项覆盖三协议路径/解析、401、取消、截断、无默认与引用预算，但没有完整403/429/5xx/超时/生成中修改依据的断言。这是证据边界，不能直接推断对应业务实现有缺陷。

## 已核对且未发现本次阻断

- 模型校验限制引用为本次所选信号、去重后重算mentionCount、检查A/B和主题引用/预算；生成保存前比对整个项目revision，审批历史由数据库校验不可改。这里只确认静态实现及现有测试，未新增付费模型请求。
- 采集保存原始链接、发布时间/缺失说明、采集时间、taskId、正文摘要；官方三平台返回待开通且后端拒绝启动。来源详情分别标记模拟、人工导入、公开来源；生成方案有模型生成提示，未将预设案例冒充真实模型或官方采集。
- `npm test -- --reporter=verbose`本机独立复跑：8文件42项全部通过（2026-10-28T15:43Z附近）。这不能覆盖C1/C2，隔离复现仍失败。
- 已读CONTRIBUTING、DELIVERY-AUDIT、TEST-PLAN、RELEASE、DESKTOP/DEMO教程及交付目录中文对应文件。交付记录明确区分本机协议测试、5条模拟情报的真实模型调用、真实公开RSS、用户平台待开通、未签名/未公证、未完独立审查与目标硬件等，未把所有发布条件写成已满足。
- 已查看`.github/workflows/ci.yml`、`desktop.yml`、`scripts/desktop-verify.mjs`及本机/两Mac CI展开的results.json：原生脚本验证本机fixture模型、CSV/实际JSON导出、SQLite重开/直接退出；两Mac记录platform=darwin且运行时间不同。Web证据为22项，72/96/48主要证明布局检测范围。CI上传整个docs目录，也包含从仓库继承的真实模型/RSS记录，不能据此声称每个平台重新执行了这些外部调用；当前发布文档没有作此声称。

## 未实测、未知与隔离边界

- 本次未重跑原生UI/安装包/三系统CI，不独立确认GitHub远端run当前状态或工件摘要；引用的历史外部验收是文件证据，不是本次重新调用。
- 真实付费模型、用户自有远端、跨设备、平台授权、人工安装/签名/公证、OS DPI/目标硬件、长正文并行压力未实测。数据同步和网络安全交由其他审查者，不在此报告重复下结论。
- 只新增`work/review-collection-validation-repro.ts/.cjs/.json`和`work/review-collect-data-*`独立数据；没有访问AppData密钥、真实付费API或用户远端，没有操作PR或对外发消息。复现通过本机HTTP fixture，CollectionService的testing参数仅为允许回环服务，解析和保存逻辑是应用原代码。

复现证据：`work/review-collection-validation-repro.json`；脚本：同名前缀`.ts`及打包`.cjs`。运行`node work/review-collection-validation-repro.cjs`可重新产生记录。
