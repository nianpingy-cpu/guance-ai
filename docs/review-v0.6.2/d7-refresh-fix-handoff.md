# D7 任务完成刷新修复交接

本人独立复审D7后，主代理授权修复；本文件是作者自测交接，需data作者和主代理独立复审，不改写`re-review-data-sync.md`针对旧代码的REQUEST CHANGES结论。

## 工程改动（本人只改四文件）

- `src/desktop/client.ts:11–14,28–45,120`：每个项目记录本地编辑代次；记录显示版本、选择代次及切换请求顺序。`readProjectForRefresh`在load返回后同时检查编辑代次、当前项目ID、显示版本与pending，不能仅凭内容revision判断安全。`refreshProject(id)`在期间出现编辑时等待保存并重新读取，切换/替代的响应直接弃用；内容未变化不重刷store。
- `client.ts:72–75`：CONFLICT恢复复用同一个安全读取校验，继续保留加载期间输入；此处不递归等待当前activeSave，避免自等。
- `client.ts:91–108`：`switchProject(id=current)`复用refreshProject；切不同项目时，原项目新输入先排空，旧切换响应不能覆盖后选项目。导出`resetDesktopProject(id)`，重置返回值不直接替换UI，而通过安全刷新读取最新项目；reset事件使用此helper。
- `client.ts:129`：2秒后台轮询复用refreshProject。
- `src/desktop/AnalysisPanel.tsx:4,15`和`CollectionPanel.tsx:4,12`：任务完成统一调用refreshProject，取消effect后不更新jobs列表。不禁用编辑，不丢队列。
- `desktop/client.test.ts`：保留原4项，加8个受控延迟回归：任务刷新期间新输入/后续修改另一字段，旧A响应不得切回A，同ID切换刷新，切不同项目时保留原项目输入，离开再返回同ID的新显示版本，旧load返回前已完成保存，刷新期间磁盘失败后的草稿恢复，后台刷新当前项目不取消已发起的不同项目选择。

## 证据

- `work/d7-refresh-red.log`：旧代码8项中3失败5通过，明确复现任务旧快照覆盖新输入/切回旧项目，以及switch同ID覆盖输入；RED时前两项使用原两个panel相同的完成刷新语句。
- `work/d7-refresh-green.log`：最终12项全通过。GREEN时前两项改为调用两个panel实际使用的refreshProject，断言最新输入既可见又留在SQLite，后续改其他字段不回写旧值。
- `npm run typecheck`、`npm run typecheck:desktop`与四文件eslint均通过，`git diff --check`通过。仅TypeScript判别联合曾报告一次类型错误，已拆分state联合并重跑通过，没有any绕过。
- 所有数据库为测试新建临时目录；fake IPC只控制响应时间。没有调用真实模型/用户远端，没有读AppData密钥，没有提交Git。

## 主代理接线

主代理已完成`src/components/layout/AppShell.tsx:100`的`await resetDesktopProject(id)`接线；`Settings.tsx:35`去重导入返回当前项目时改用refreshProject，不同项目才applyProject。本轮只读rg确认这两处改动，本人没有改这两个文件；统一构建及原生回归由主代理执行。

剩余直接projects.load仅安全读取helper及跨项目switch本身。设置里的创建/导入是明确项目选择操作，保留applyProject；同步设置通过switchProject(current.id)已自然接入安全刷新。
