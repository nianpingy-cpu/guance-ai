# Atom标题、命名空间与xml:base修复交接

2026-10-29。主代理在0.6.2统一构建后要求补查标准Atom输入；本文为作者实证及修复交接，独立复审已交给recovery_validation。

## 修改前实证

在改工程前，使用当前源代码模块、127.0.0.1 HTTP fixture和work独立SQLite记录`work/atom-standards-before.json`。五场景全部不符合预期：

1. text标题`茶&lt;例&gt; &amp; 茶`被原样存为转义串，未得到`茶<例> & 茶`。
2. html标题转义markup被原样存入，未得到可读标题`茶 & 香`。
3. XHTML标题含div/em，scalar只读取#text，新增0条，误报缺标题/正文。
4. 合法`a:feed`与另一个合法别名`b:entry`，任务failed“未发现RSS/Atom条目”。
5. feed基址`https://example.com/catalog/`、entry基址`../articles/`、link基址`2026/`、href=`tea.html`，实际源链接指向本机fixture站`http://127.0.0.1:端口/tea.html`，应为`https://example.com/articles/2026/tea.html`。

当时定位：collect.ts的feedSchema/固定root-key、markupItems固定选择器、scalar(item.title)、new URL(target,url)。这是实际解析错误，不是仅缺覆盖。

## 小范围修复

仅本人改`desktop/collect.ts`及`desktop/collect.test.ts`：

- 增加`atomRecords`，在有序XML DOM中按展开命名空间URI及local name识别Atom feed/entry/直接字段；合法前缀及不同别名均可用，不把扩展命名空间中的entry/title当Atom。
- 标题与正文按text/html/xhtml构造读值，正确解码实体、保留内联顺序；复用recovery作者的text清洗函数，函数本身未改。
- 以文档URL为初始基址，依次应用祖先与link上的xml:base，再解析href；只保存HTTP/HTTPS文章URL，不额外读取文章或执行脚本。
- RSS原结构解析/抽取路径保留，只复用同一个XML DOM，避免为新增Atom分支额外重复解析RSS。最初URL校验、公开网络绑定、超时、DTD拒绝、任务保存及零结果待办规则未改。
- 新增5回归，覆盖三个标题格式、不同合法Atom前缀与外部同名扩展排除、三级xml:base。

## 验证

- RED：`work/atom-standards-red.log`，采集16项中新增5失败、原11通过。
- GREEN：`work/atom-standards-green.log`，采集16+导入8，共24项通过。
- 独立入口重构建后`work/atom-standards-after.json`五场景均passed=true；源码入口`work/atom-standards-probe.ts/.cjs`。运行node work/atom-standards-probe.cjs after可重测，不调用真实站点。
- `npm run typecheck:desktop`、两文件eslint、git diff --check通过。没有改package/docs、用户数据、密钥、远端或提交Git。

本轮没有重新构建desktop-dist/安装包；主代理需在新增解析独立复审后统一构建/原生回归。这里不宣称实现所有Atom扩展、所有RSS变体或通用爬虫。
