# 采集与导入修复独立复审

复审日期：2026-10-29（Asia/Shanghai）。审查者未参与本轮导入或采集修复。读取原始 `review-collection-validation.md`、修复交接 `review-collection-validation-fix.md`，并复审工程工作区中的 `src/lib/importSignals.ts`、对应测试、`desktop/collect.ts` 的正文解析/计数/反馈闭环及对应测试。**整体结论：REQUEST CHANGES；剩余一项 P2。**

| 项目 | 结论 | 本轮核对结果 |
|---|---|---|
| C1：JSON 混合 null、数组、对象不取消有效行 | APPROVE | 根数组与 `signals` 包装数组均可保留两条有效行；null、数组、数字、布尔值报告对应类型错误，空对象及缺标题对象报告缺标题。六个失败项行号保持 `[1,2,3,5,7,8]`，没有整文件异常。 |
| C2：常见 Atom text/html/xhtml 的正文提取、内联顺序与实体 | APPROVE（下述 R1 除外） | text 中的字面 `<em>` 保留为文字；HTML 解码后去标签；XHTML 交错文本/强调/尾文顺序正确；`&amp;`、数值字符实体、嵌套 HTML 实体、CDATA、默认 text 及空 content 回退 summary 均通过。带 XHTML 前缀的普通内联文本也通过。 |
| 重复/缺标题或正文的计数及零新增反馈语义 | APPROVE（下述 R1 除外） | 全重复时 `新增0/重复6`、反馈保留 open 且项目 revision 不变；两个缺标题/正文条目时 `新增0/缺少2`、反馈仍 open；混合 `新增1/重复1/缺少1` 时反馈变 done。 |
| C2：所有已支持 XHTML 表示形式的正文清洗及有效结果判断 | REQUEST CHANGES | R1：带命名空间前缀的脚本节点被当作有效正文，纯脚本条目仍新增情报并错误完成复盘待办。 |

## R1：带 XHTML 前缀的 script 文本绕过正文清洗并错误关闭待办（P2，BLOCKING）

- 位置：`outputs/guance-ai/desktop/collect.ts:20` 清洗器只选择无前缀的 `script,style,nav,footer,iframe,noscript`；`:61` 将 XHTML XML 子树串交给此 HTML 清洗器；`:77–85` 随后把残留脚本文字认定为有效正文并完成反馈任务。
- 触发：有效 Atom feed 中，一个含 id/title/link/updated 的 entry 使用以下正文。反馈任务开始为 open，数据库及 HTTP fixture 均为独立临时数据。

```xml
<content type="xhtml">
  <xh:div xmlns:xh="http://www.w3.org/1999/xhtml">
    <xh:script>SHOULD_NOT_BE_EVIDENCE()</xh:script>
  </xh:div>
</content>
```

- 期望：与默认命名空间下同等 XHTML script 清洗一致；没有可用正文则新增 0 条，关联反馈继续 open。
- 实际：任务 completed，结果为 `读取1条，新增1条；重复0条，缺少标题/正文0条`；新增 source.rawContent 为 `SHOULD_NOT_BE_EVIDENCE()`；关联反馈变为 done。这不是脚本执行问题，而是脚本文字被当作采集证据及错误完成业务待办。
- 原因：Cheerio 的 HTML 模式把 `xh:script` 视为带冒号的元素名，现有 `script` 选择器不匹配它。正文有普通文章时也会污染 quote、summary 与去重内容；纯脚本时直接重现原 C2 的“没有有效证据仍完成待办”。
- 标准依据：[RFC 4287 §1.3](https://www.rfc-editor.org/rfc/rfc4287#section-1.3) 指出前缀选择不改变语义；[§3.1.1.3](https://www.rfc-editor.org/rfc/rfc4287#section-3.1.1.3) 也给出带前缀的 XHTML 示例。此 fixture 的前缀表示是标准形式。
- 建议：在 XHTML XML 树中依据命名空间及本地元素名移除不属于可读正文的节点，再提取有序文本；保留 text/html 类型各自的实体解码语义。新增前缀 XHTML 的“文章+脚本”和“纯脚本+open 反馈”回归，断言脚本文字不入库且后者新增 0/待办不完成。复审者未修改业务实现。

## 实测证据

- `npx vitest run src/lib/importSignals.test.ts desktop/collect.test.ts --reporter=verbose`：2 文件、12 项全部通过，本轮运行约 2026-10-28T16:10Z。现有混合 Atom 测试只覆盖无前缀 script，未覆盖 R1。
- 独立探针：`work/re-review-collection-probe.ts`，打包执行文件 `work/re-review-collection-probe.cjs`；结果 `work/re-review-collection-probe.json`，2026-10-28T16:12:47.869Z。8 组检查 7 通过、R1 一组失败，结果保留实际新增数、反馈状态及脚本文本。
- 探针直接调用工作区原代码 `CollectionService` 和 `parseSignalImport`。CollectionService testing=true 仅用于 127.0.0.1 fixture；解析、计数及保存逻辑未替换。临时数据库创建后清理，不读取正常用户目录、凭据或真实 API，不改工程源文件、package 或 Git 提交。
- 网络 transport、地址校验、重定向及 DNS 安全不在本报告结论范围。此次定向命令随 collect.test 一并执行了其中已有的地址分类断言，不能据此视为网络复审通过。

原始 NON-BLOCKING 的导入文案与综合测试标题覆盖范围不影响本次 R1 结论；其后续状态由主代理统一核对。修复交接中的“脚本仍由正文清洗移除”目前只对无前缀脚本成立。
