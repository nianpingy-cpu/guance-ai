# 两个任务面板的项目身份修复独立复审

结论：**APPROVE**（本次 AnalysisPanel / CollectionPanel 项目身份修复）。未发现该组新增改动的阻断问题。

复审者未编写这组组件修复。只读检查两个面板完整源码、相对基线 diff、TaskPanels.test.tsx 和作者 RED 记录，并实际运行组件假 IPC 与底层队列测试。没有修改工程、运行真实模型/采集/WebDAV请求、读取用户数据或凭据。

## 关键路径核对

- **范围表示一次访问，覆盖 A→B→A。** AnalysisPanel.tsx:14–17、CollectionPanel.tsx:11–14 在项目改变时关闭旧 scope 并建立新对象；isCurrent 同时检查 active、scope 对象身份和实时 desktop current.id。回到同一项目 ID 不会重新启用旧访问的 scope，因此旧 start/retry/cancel 响应不会仅因当前 ID 再次等于 A 而通过。
- **旧项目行立即排除。** AnalysisPanel.tsx:22、CollectionPanel.tsx:19 的 visibleJobs 按实时 projectId 过滤，旧 A 行不能作为 B 的取消/重试入口；effect 同时清除旧 jobs 和消息。AnalysisPanel 的选中情报、搜索、错误及 busy 也在项目访问变化后复位，不会长期沿用 A 的等待状态。
- **等待保存后再次确认项目。** AnalysisPanel.tsx:24–33、CollectionPanel.tsx:20–28 在 flushDesktop 完成后重新检查 scope。若期间切到 B，原 A 提交不再发出；若已经在 A 发出请求，则任务仍按原 projectId 在后台执行，晚到结果不能写入 B 的本地 jobs/消息。
- **取消和重试绑定原任务。** 两个 cancel 入口在发送前验证当前 scope 和 job.projectId，错误返回后再次验证 scope。CollectionPanel.tsx:35–42 对 retry 同样核对访问范围与返回 job.projectId，不能把旧项目的重试结果加入新项目。
- **轮询与 D7 数据刷新继续受保护。** 两个 poll 在 jobs.list 返回后核对 scope/取消标记，任务过滤 projectId；等待 refreshProject 后再次检查 scope 才写 jobs。D7 的 refreshProject 调用保留，组件取消不会把旧任务列表或错误带回新项目。effect 清理停止定时器并关闭旧 scope。
- **正常功能保留。** 同一当前访问内的模型/采集启动、取消、采集重试仍可更新对应面板；代码没有通过禁止项目切换、取消后台业务任务或关闭正常按钮来规避延迟响应。

## 测试核对与执行

读取 `work/panel-project-scope-red.log`：旧实现的 16 项组件用例全部失败，包含旧任务/错误残留、start 成功/失败晚响应、等待 flush 后错发、cancel 错误、retry 成功/失败晚响应及 A→B→A 的旧访问响应。没有把缺少测试本身当成缺陷。

本轮实际执行：

`npm test -- --run src/desktop/TaskPanels.test.tsx desktop/client.test.ts`

结果：**2 文件、31 项通过**，其中组件 19 项、底层队列 12 项。组件测试通过受控 deferred Promise 改变响应先后顺序，并断言真实渲染 DOM 中不出现旧项目进度/错误、旧启动命令不再提交，以及正常当前项目启动/取消/重试继续存在。底层队列测试使用新建临时 SQLite；组件 IPC 完全为本地假实现。

对三个本次文件运行 ESLint 与 diff 空白检查均通过。

## 结论边界

本批准只覆盖另一位作者本次面板状态/响应身份修复；不覆盖尚未统一构建的安装包，也不把先前构建的性能记录自动当成本组最终界面改动的原生证据。后续统一构建与原生回归由主流程执行。
