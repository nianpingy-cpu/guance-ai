# D7 刷新与项目切换保护独立复审

结论：**APPROVE**（D7 新增刷新保护及接线）。没有发现该组改动的阻断问题。

本复审针对另一位作者后续修复的 D7：`src/desktop/client.ts` 新增 editVersions / viewVersion / selectionVersion / switchVersion、readProjectForRefresh / refreshProject / resetDesktopProject，以及 AnalysisPanel / CollectionPanel 的刷新调用。本人是此前队列修复的作者，因此此结论不作为本人原始数据修复的独立批准；原始六项应采用 collection 作者的独立复审结论。

## 只读核对

- `client.ts:28–34`：在开始 load 前保存本地编辑代次和 viewVersion。响应返回后先核对项目 ID，再检查编辑代次、pending 和显示版本。即使新输入已经保存并且 pending 已清空，编辑代次仍使旧响应失效；离开再返回同一个项目时，viewVersion 也阻止旧响应覆盖新显示。
- `36–46`：refreshProject 先排空保存。加载期间出现输入时重新排空并读取；已经切换或被新显示替代时放弃；相同内容 revision 不重复 apply。实际任务完成、后台轮询和同 ID switch 共用此路径。
- `66–77`：冲突恢复只调用安全读取 helper，不递归等待自身 activeSave。加载期间的更晚输入会继续可靠保留为冲突，然后再重新读取；其他项目的响应不会应用到当前窗口。
- `92–103`：跨项目选择保留 switch 请求次序和项目选择代次。加载期间旧项目的新编辑先保存；后发出的另一个项目选择或明确 applyProject 会使旧选择失效。同项目后台 refresh 不递增跨项目 switchVersion，因而不会取消仍在途的用户项目选择。
- `105–110`：resetDesktopProject 不应用 reset 请求返回的过时快照；它在保存后确认项目身份，重置完成仍匹配当前选择时才使用同一安全刷新流程。重置期间输入仍走正常保存/冲突保存，不能直接被 reset 返回值覆盖。
- `AnalysisPanel.tsx:14–17`、`CollectionPanel.tsx:11–14`：任务由 running 转到终态后调用 refreshProject，effect 停止后不更新旧 jobs 列表。即使多个 poll 请求交错，底层刷新守卫仍约束是否可应用数据。
- 根代理接线：`AppShell.tsx:100` 使用 resetDesktopProject；`Settings.tsx:35` 去重导入若返回当前项目使用 refreshProject；`SyncSettings.tsx:13` 的 switchProject(current.id) 自动走安全刷新。以上只读确认，没有修改这些文件。

## 实际测试

运行现有 `npm test -- --run desktop/client.test.ts`：**1 文件、12 项通过**。

阅读测试中实际受控交错的断言，覆盖：刷新期间输入与后续另一字段保存、旧项目响应不能切回、同项目刷新、新项目加载时旧项目继续输入、离开再返回同项目的新显示、旧 load 返回前已完成新保存、磁盘失败后草稿恢复、同项目后台刷新不取消在途新项目选择。使用真实临时 LocalDatabase 与假 IPC 响应时序，没有外部请求、用户数据或密钥访问。

## 结论边界

此结论批准 D7 的新增逻辑和已查看的 UI 接线。没有把作者原始自测当作独立结论；没有改写较早基线的 REQUEST CHANGES 记录。统一构建后的原生回归仍由主流程执行。
