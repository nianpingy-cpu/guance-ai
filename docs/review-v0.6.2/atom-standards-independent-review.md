# Atom 标题、命名空间及 xml:base 修复独立复审

2026-10-29（Asia/Shanghai）。结论：**APPROVE**，仅针对本轮新增 `atomRecords` 和标准 Atom 分支及五项回归。复审者未参与这一新增实现；此前的通用 `text` 前缀清洗是本人实现，本报告不以自审替代其已完成的第三方复审。

| 项目 | 结论 | 证据 |
|---|---|---|
| text/html/xhtml 标题及实体 | APPROVE | 标题与正文使用同一有序 DOM 读值规则。text 的转义字面标签仍是文字，html 解码后提取文本，xhtml 保持强调节点前后的顺序并应用正文清洗。作者五项回归及独立复跑通过。 |
| Atom 前缀及扩展隔离 | APPROVE | `namespace` 从元素自身沿最近祖先寻找对应 xmlns 声明，`isAtom` 同时比较本地名称和 Atom URI；只取 Atom 直接子节点。独立 probe 覆盖前缀在 entry 上由 foreign 重绑定为 Atom、由 Atom 重绑定为 foreign，以及 foreign 的同名 entry/title/content/link，不混入扩展文本或链接。 |
| xml:base 继承与原文链接 | APPROVE | 链接按文档 URL、祖先由外到内、link 自身依序应用 xml:base。独立 probe 验证绝对 base 重置、相对 href、alternate 优先于 self、href 的 `&amp;` 恢复，最终 URL 正确。只保存该原文 URL，probe 没有请求其站点。 |
| 原有导入/正文/零新增语义回归 | APPROVE | 定向两文件 24 项全部通过，包含此前混合 JSON、Atom 正文、六类前缀非正文节点、重复/缺正文计数与 open 待办保持。 |

## 执行记录

- 已查看实际 `desktop/collect.ts` 与 `desktop/collect.test.ts` 工作区 diff，并核对 `work/atom-standards-before.json`、`after.json`、作者 RED/GREEN 记录。新标准 Atom 路径不再依赖 fast-xml-parser 的标量标题；RSS/无命名空间旧路径保留。
- 独立运行 `npx vitest run desktop/collect.test.ts src/lib/importSignals.test.ts --reporter=verbose`：2 文件 24 项通过，日志 `work/atom-standards-independent-tests.log`。
- 另外编写独立 fixture，不复用作者五个样例：`work/atom-standards-independent-probe.ts/.cjs/.json`。三组均通过，记录时间 2026-10-28T16:47:59.217Z。其实际标题分别为 `甲 & 乙`、`前中&中后`、`链接继承`；预期原文 URL、正文及条数均一致。
- 未发现本次范围新增 BLOCKING 或需变更的实现问题。APPROVE 不代表所有 Atom 可选媒体类型、所有不合法 XML、独立 Atom Entry 文档或所有 RSS 扩展均已覆盖。

本轮仅新增 work 下的审查探针与报告。数据库为新建临时目录，HTTP 仅 127.0.0.1 fixture；没有读取正常用户数据/凭据，没有真实平台、模型或远端请求，没有修改工程源文件、package 或 Git 提交。网络 transport 与地址安全由另一审查者负责，不在本次结论范围。
