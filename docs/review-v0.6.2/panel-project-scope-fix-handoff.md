# 任务面板项目身份隔离修复交接

2026-10-29。根代理要求补核对两个任务面板的项目身份；本次只改`src/desktop/AnalysisPanel.tsx`、`src/desktop/CollectionPanel.tsx`及新增`TaskPanels.test.tsx`，未改client、采集/模型服务、数据核心或package/docs。修改后已交data作者独立复核。

## 修改前实证

真实React组件在jsdom渲染，window.guance为假IPC，flushDesktop/refreshProject仅在此组件测试中被替换为可控空/延迟动作。无网络、用户文件或真实模型请求。

`work/panel-project-scope-red.log`记录16项全部失败：

- A初始任务仍running，切B且B的jobs.list尚未返回，仍显示A的进度和取消按钮；A的poll错误也留在B。
- 在A点击生成/采集，IPC返回延迟，切B后放行A成功或失败，B显示A任务/错误；采集还显示“采集任务已建立”。
- 在A点击后flush尚未结束，切B再结束flush，仍发出A的旧启动请求。
- 取消或重试A任务后切B，后续取消错误、重试成功/错误污染B。
- A→B→A再次进入相同项目，早一次访问的start响应仍被接受，单比projectId不足以隔离访问生命周期。

## 修复

- 两面板各使用一个每次项目访问独立的scope对象，进入不同项目使旧scope失效；isCurrent还检查组件活动状态与useDesktopState中的实时current.id。A→B→A也不会复用旧scope。
- effect切项目清理旧jobs和error/message；分析面板同时清selection/query/busy。任务渲染及启动禁用条件按当前projectId过滤，旧行不能成为B的取消/重试入口。
- start在flush后、IPC返回后再次核对scope和projectId；返回任务不属于请求项目则拒绝插入。cancel/retry在调用前核对任务所属项目，异步错误/结果仅在原scope仍活动时更新当前UI。旧分析finally不会清掉B的新busy状态。
- 轮询继续使用D7的refreshProject；刷新后更新任务列表前再次核对scope/cleanup。没有用禁用跨项目编辑、取消原项目任务或丢弃底层保存队列代替修复。

## 验证

- `TaskPanels.test.tsx`共19项：原16个失败边界转绿，另加当前项目启动/取消/重试正例，确保正常功能仍可使用。
- `work/panel-project-scope-green.log`：组件19 + 原底层client12，合计31项全部通过。绿色记录没有React act/key警告；测试假IPC只返回契约对应的任务/列表。
- 前端typecheck、三文件ESLint、git diff --check通过。没有触碰client的刷新守卫或其他作者核心文件，没有提交Git。
- 本次未重新构建desktop-dist或安装包；独立复核后由主代理统一构建/原生回归。
