# Atom前缀正文清洗修复独立复审

结论：**APPROVE**（仅针对recovery_validation作者本次前缀清洗修复）。本人参与过之前的Atom内联正文修复，没有参与本次`text`辅助函数及前缀回归的修复实现；本轮未改这两个工程文件。

- 实际查看`desktop/collect.ts`和`collect.test.ts`的git diff，并区分此前正文提取及网络安全改动。本次新增核心是collect.ts:20–26按节点的本地tagName（去命名空间前缀、小写）排除script/style/nav/footer/iframe/noscript，删除对应整个子树，然后提取剩余文本。网络transport及任务完成条件未被本次改动覆盖。
- 作者RED日志确有7项失败：前缀非正文内容被作为证据、混合正文含脚本/样式等。本人独立运行`npm test -- desktop/collect.test.ts src/lib/importSignals.test.ts --reporter=verbose`，19项全通过，包括六种前缀节点零新增/待办保持open、有效文章顺序与实体、原RSS/Web及JSON导入回归。
- 另写独立probe，不复用作者测试fixture：大写命名空间前缀`Z`、强调节点、被转义的字面`<script>`示例混合正文得到`甲乙<script>示例</script>丙`（真实非正文脚本删除，转义示例保留）；长前缀的六类非正文节点合计正文为空，新增0、反馈open。两组均通过。证据`work/re-review-collection-prefix-fix-probe.ts/.cjs/.json`。
- 未发现本次范围新增BLOCKING。有效正文仍保持顺序，清洗后的空内容不会新建情报/来源或误完成反馈；没有把该修复描述为网页脚本执行能力或完整HTML安全净化。

范围：本次只验证正文提取/清洗与任务语义，HTTP仅本机fixture、SQLite为work中新建独立目录；没有真实平台/模型/用户远端调用。没有重跑原生UI或所有采集格式，不将这些未覆盖项目直接当bug。
