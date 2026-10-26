# 开发约定

沿用 FocusLoop 的协作循环：Issue → Branch → RED → GREEN → Refactor → Commit → PR → 独立审查 → CI → Merge。

- 一个 Issue 对应一个分支和 PR，分支包含 Issue 编号；不直接推送 main（首次原工程导入除外）。
- 功能修改先证明测试失败再实现；纯样式、文档和配置使用可复现视觉/构建验收。
- 提交使用 Conventional Commits，不混入无关重构。
- lint、typecheck、test、build 全通过；不删弱测试，不掩盖失败，不以 any 绕过边界。
- 独立审查阅读需求、diff、测试与 CI，记录 BLOCKING/NON-BLOCKING 和 APPROVE/REQUEST CHANGES；审查通过前不合并。
- 保持四个入口；桌面数据与任务仅通过校验的 IPC 接口进入独立本地进程；所有模拟数据和预设分析可辨认；行为变更同步文档。
- 浏览器验收保存四页三个视口截图和关键操作结果；不把旧截图、预设结果或未来监控当作本轮证据。

桌面改动须检查 contextIsolation、sandbox、导航限制、IPC 白名单、密钥隔离、本地数据迁移及升级备份。PR 独立审查完成前保持 Draft，不自动合并。
