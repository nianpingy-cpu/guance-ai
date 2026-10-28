# 数据与同步修复独立复审

复审时间：2026-10-29（Asia/Shanghai）。复审者没有参与本次数据/同步修复；本轮只读工程。已读`work/review-data-sync.md`、`work/data-sync-fix-handoff.md`，逐段核对当前实际git diff及调用方，而不是仅以作者交接或测试名称作结论。

**结论：REQUEST CHANGES。原报告六项已在所检查场景解决；新增一项P1保存/任务刷新交错缺陷仍会让最新输入被旧界面状态覆盖。**

## 原问题逐项复核

| 原项 | 结论 | 独立核查与证据 |
|---|---|---|
| 1 保存失败清掉更晚输入 | 已解决原触发场景 | client.ts:9、26–27将草稿按项目分组；35–57在CONFLICT下保留更晚快照、重载期间继续输入，并在普通错误下保留队列。独立复跑client4项全绿；另测A磁盘失败期间产生A最新输入、切B编辑，恢复后A/B分别保存最新输入，没有互写。仍有下方另一刷新入口的问题 |
| 2 两端同时复决静默分叉 | 已解决 | database.ts:119–157使用事件UUID的parents图判断因果，resolveConflict:168–170产生新事件并把所见主头/冲突事件作为父。独立矩阵local/remote四组合×是否复决后继续离线编辑，共8组，两端都保留可见冲突，再选择后收敛 |
| 3 reset/ABA误作旧内容重放 | 已解决 | resetDemo仍可有相同内容摘要，但record产生不同事件身份。独立连续500000→600000→500000→600000→500000，再执行两次reset，7个事件逆序投递并按精确parents重试，远端最终一致且无冲突。不会因已有相同内容hash而提前接纳缺父事件的后代 |
| 4 企业预算小数被改写 | 已解决原触发场景 | CompanyDrawer.tsx:28改为两位小数。实际组件测试1分、500049分、500050分往返保存均通过。没有把UI显示断言代替保存后的值检查 |
| 5 跨站/跨账号复用原密码 | 已解决 | sync.ts:29–37在写设置之前检查origin、账号、目录变化；跨站或账号空密码拒绝，换目录空口令拒绝。定向测试验证拒绝后旧配置保留，原站原账号留空保留仍可用；无真实凭据或用户远端 |
| 6 项目切换交错错写 | 已解决原触发场景 | client.ts:9、26–32绑定项目身份，旧响应只更新所属项目，switchProject:65–68在加载目标后再排空编辑。作者对应回归及本轮A失败+B编辑恢复均验证数据库A/B和当前项目身份正确 |

## 新BLOCKING

### D7 [P1] 采集/模型任务结束刷新会覆盖加载期间的新输入，并在后续编辑时静默写回旧值

位置：`outputs/guance-ai/src/desktop/CollectionPanel.tsx:12`、`src/desktop/AnalysisPanel.tsx:15`的完成刷新路径；`src/desktop/client.ts:11–16`无条件替换store；`:30–32`保存成功只推进current元数据。

触发顺序：

1. 任务运行结束，面板轮询调用`await flushDesktop()`后发出`projects.load`，数据库读取当前项目快照，IPC响应尚未回到窗口。
2. 用户继续输入，产生新草稿并开始`projects.save`。
3. 面板的load旧快照先返回，调用`applyProject`把UI恢复为旧值。
4. 新草稿save成功，client只更新`current`元数据，未把已保存新内容恢复至store。此时数据库有新输入、UI却显示旧输入，current.revision已经等于数据库，通用轮询也不会纠正。
5. 用户再只修改另一个字段时，提交的是带旧输入的store快照，以最新revision成功保存，把刚才的新输入写回旧值，无冲突提示。

本轮独立复现使用应用原始client/store/LocalDatabase，fake IPC仅延迟加载与保存响应，按上述两个面板**相同完成刷新语句**运行，不修改工程。初始B.goal=`B最新输入`；load等待时输入`任务刷新期间输入的新目标`。放行加载再放行保存后：

```json
{
  "afterSave": {
    "storedGoal": "任务刷新期间输入的新目标",
    "visibleGoal": "B最新输入"
  },
  "afterOtherFieldEdit": "B最新输入",
  "conflicts": 0
}
```

证据：`work/re-review-data-sync-cases.json`最后一项；复现源码同名前缀`.ts`，构建后`.cjs`可直接运行。这里不是实际原生窗口复测，但延迟以外的持久化/队列/store都是当前工程实现，且调用方没有阻止这类输入。

建议：统一后台项目刷新入口，对加载开始时的项目/版本/本地编辑世代做校验；加载期间出现编辑或保存即丢弃旧响应、等待保存后重新加载。`flushDesktop`只保证调用时已有队列处理完成，不能保护其后await load的窗口。不要用旧快照替换已有新草稿。补包含“新输入保存后仍可见”和“后续修改其他字段不会恢复旧值”的回归，覆盖采集与模型完成刷新。

## 因果图、迁移与兼容性补查

- 当前因果判断读取`Change.parents`，不再沿parentRevision或resolves内容hash行走；缺parents的旧事件明确拒绝。缺精确父ID返回pending，同ID旧内容不能代替父事件。
- 迁移v1/v2→v3先备份；旧changes仍在本地，当前项目及每个未解冲突产生独立根检查点。本人另建含**两个**未解冲突的v2库，升级后3个检查点、原2个冲突保留；逆序发送到全新实例仍有2个冲突，选择后两端收敛且两条旧分支都保留在业务项目或“冲突保留”项目中。
- 作者定向测试中的迁移失败回滚/备份可读、旧协议远端拒绝，本轮独立复跑通过。SyncService只上传parents已定义的新事件，manifest为2、认证上下文为guance-v2。旧协议目录先GET清单即拒绝；未观察到自动改写旧目录。
- 同内容的并发解决仍出现需要选择的新冲突，是当前保守策略，矩阵已证实；没有将其误当静默分叉缺陷。

## 实际验证与范围

- 独立命令：`npm test -- desktop/client.test.ts desktop/database.test.ts desktop/sync.test.ts src/features/company/CompanyDrawer.test.tsx --reporter=verbose`，**4文件27项通过**。
- 另写12组独立受控场景：8组复决矩阵、1组ABA与reset逆序、1组两冲突迁移、1组跨项目失败恢复全部通过；最后1组任务完成刷新复现D7。详见`work/re-review-data-sync-cases.ts/.cjs/.json`。
- 工程未改动，只在work创建复审脚本、结果及独立SQLite数据目录；未读取用户AppData或密钥，未请求真实付费模型/用户远端，未提交或操作PR。
- 未重跑原生UI、完整三系统CI/打包、真实WebDAV或跨物理设备；不将这些未覆盖项目直接列为bug。这里的APPROVE/REQUEST CHANGES仅针对本次数据/同步变更及其实际保存调用链。
