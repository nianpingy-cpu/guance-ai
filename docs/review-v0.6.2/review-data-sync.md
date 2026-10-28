# 观策 AI v0.6.1 数据与同步独立审查

审查基线：18888c4（应用代码 a7220cff4b569c2cfb09e97f003de93f56c59774）。结论：**REQUEST CHANGES**。

在任何修复前记录本报告。审查读取 CONTRIBUTING.md、DELIVERY-AUDIT-v0.6.1.md、TEST-PLAN-v0.6.md，以及完整 SQLite / schema / service / sync / renderer 队列 / 预算审批和复盘相关代码，并核对 58f7ee0、9887a17、88fe67b、ade2cc9 等历史提交。没有读取用户真实应用数据或凭据，没有调用模型、用户远端或发送外部消息。复现使用独立临时 SQLite、假 IPC 和内存 DOM；工程在报告形成时未修改。

## BLOCKING

### 1. [P1] 保存失败清空更晚的等待输入，冲突副本也不包含这些输入

- 位置：`src/desktop/client.ts:32–36`，尤其第 33 行 `pending = undefined`。
- 触发：renderer 仍持旧 revision；一次保存已经发送但尚未返回时，用户继续编辑，产生新的 pending。后台同步/采集/分析已推进数据库 revision，使先发送的保存返回 CONFLICT。
- 实际：数据库按已发送内容保留冲突，但 catch 直接清掉更晚的 pending，再 applyProject 最近数据库数据，覆盖界面。最新输入在主项目、changes 和 conflicts 中均不存在。相同问题也适用于普通持久化失败后的最新输入。
- 复现：使用真实 LocalDatabase 建项目，renderer 保持旧版本，数据库先保存预算 888800；延迟第一个保存 IPC，先输入 `first queued edit`，再输入 `latest queued edit that must survive`，放行 IPC。结果 conflictGoals 仅为 first queued edit；latestRetainedAnywhere=false，界面恢复初始目标。见 `work/review-data-sync-repro.json` 的 queue。
- 影响：同记录并发编辑丢失用户输入；“不同版本已保留”的错误消息无法覆盖更晚版本。
- 建议：失败路径保留失败快照及最新 pending，按所属项目保存为可恢复冲突/草稿，或留在界面等待重试；在最新编辑得到可靠保存前，不清队列、不用旧数据覆盖。

### 2. [P1] 两端同时选择冲突版本会永久静默分叉

- 位置：`desktop/database.ts:108–110`、`122–128`、`139–141`。
- 触发：A/B 从同一父版本分别修改预算为 111100/222200，相互同步看到冲突后，在下次同步前分别选择“采用本机版本”。
- 原因：resolveConflict 继续使用所选内容的 revision，同时把全部候选 revision 写入 resolves；ancestor 把 resolves 当普通祖先边。两端各自的解决事件立即把对方内容 revision 视为已经覆盖。
- 复现：分别 resolve local 后交换全部 changes 三轮。A=111100，B=222200，双方 conflicts=0，双方已知 change ID 集完全相同。见 JSON 的 concurrentResolution。
- 影响：系统报告已解决/同步完成，但同一项目不收敛，也无冲突可再处理。后续数据以不同底稿继续发展。
- 建议：将“版本事件身份”和“内容摘要”分开；解决操作产生独立版本事件并保留因果父事件。并发解决事件应保留为新冲突或按清楚、确定且不丢版本的规则收敛，不能凭内容摘要宣布已经解决。

### 3. [P1] 将内容回到旧值的合法新操作误判为历史重放

- 位置：`desktop/database.ts:122–124`，与 `157–162` 的演示重置组合。
- 触发：两端同步演示项目，初始预算 500000；A 改到 600000 并同步到 B；A 执行“恢复演示数据”并再次同步。
- 复现：A=500000，B=600000，B 记录了重置事件且 conflicts=0。见 JSON 的 reset。
- 原因：重置返回与初始内容相同的 revision，ancestor 判断其已是 600000 版本的祖先，因 covered=true 跳过了真实的新重置操作。
- 影响：用户明确提交的新状态不传播，双方显示同步成功而不同步。这也说明仅用内容摘要表示版本无法区分“重放旧操作”和“新操作回到旧内容”。
- 建议：与上一项一起引入独立版本事件身份；至少必须优先应用以当前版本为父的新事件，而不能先以内容祖先过滤。

### 4. [P1] 打开企业资料后保存会改写金额的小数部分

- 位置：`src/features/company/CompanyDrawer.tsx:28`；保存第 96 行写回解析后的表单金额。
- 触发：企业预算有合法的分值，如 500049 分（5000.49 元）；打开企业资料并点击“保存资料”，无需修改预算。
- 复现：真实 CompanyDrawer 组件在隔离 DOM 中渲染和点击：before={budgetCents:500049,health:valid}；输入框显示 `5000`；after={budgetCents:500000,health:needs-reconfirm}。见 `work/review-budget-repro.json`。
- 影响：保存其他企业资料时悄然更改业务预算；0.01 元预算会被显示为 0 并导致无法保存。金额仍是整数分，经济数值已被错误改变。
- 建议：表单初始化保留两位小数或无损十进制表示；覆盖包含 1 分、49 分、50 分的往返保存。

### 5. [P1] 更换 WebDAV 站点后复用旧密码，向新站点发送原站点凭据

- 位置：`desktop/sync.ts:25`（空密码复用 before.passwordCipher），`28–30`（随后生成新 URL 的 Basic Authorization）。
- 触发：已有站点 A 配置；将 URL 改为不同 origin 的站点 B，密码输入框留空并保存，然后测试/同步。
- 实际路径：配置保留 A 的密文密码，后续解密并发送到 B。独立安全审查代理已以假凭据证实；本代码审查也确认该数据流。
- 影响：用户本意为保留当前表单或改连接，A 的密码被交给 B。
- 建议：origin 改变时必须显式重新输入目标站密码；同步口令的留空复用规则也应在界面清楚说明，避免无意识地向新站初始化旧共享密钥。只使用假凭据测试。

### 6. [P1] 项目切换与旧项目保存交错时，队列可把第二项目内容写到第一项目

- 补充复核：修复过程中对基线队列额外做受控延迟验证；原行为的 RED 记录在 `work/data-project-queue-red.log`。
- 位置（基线）：`src/desktop/client.ts:9` 的无项目身份 pending，`27` 按当前项目取保存目标，`31` 无条件接受旧保存响应。
- 触发：第一项目保存尚未返回时，切换/应用第二项目，再在第二项目编辑。项目加载较慢、旧项目保存响应延后时可形成这种交错。
- 复现：独立真实 SQLite A/B 项目；延迟 A 的保存，applyProject(B)，编辑 B 后放行。原代码把 B 的内容写到 A，B 没有得到编辑，旧保存响应把 current 指回 A。
- 影响：跨项目数据错写、当前项目身份与显示内容不一致。
- 建议：将每份待保存快照绑定项目 ID 与版本，按项目排队；旧项目响应只能更新该项目的基线，不能改变当前项目身份；切换读取完成后再排空旧项目编辑。

## NON-BLOCKING / 已核对

- 常规本地保存使用 BEGIN IMMEDIATE、预期 revision、异常回滚；v1→v2 迁移前 VACUUM INTO，备份可读测试存在且本轮通过。
- schema 在存储边界验证非负安全整数分、来源/主题/审批/复盘引用、渠道重复及审批快照内部摘要。正常 save 对既有审批 JSON 做不可修改/不可删除比较，并重新核验新审批预算与当前依据。
- 预算/依据变化通过 fingerprint 使审批需复审；历史审批和复盘仍可查看。空值与零分母有显式指标处理。
- 同步上传的是 changes 中的业务项目版本，经 AES-256-GCM 与上下文认证；settings 中的模型/WebDAV/平台凭据、jobs 和 SQLite 文件没有进入上传路径。错误口令/篡改拒绝；前序缺失会 pending、重复 ID 幂等。
- 多个未选冲突版本在现有 resolveConflict 中保留为独立项目；常规两端和三版本单端解决测试通过。上述 BLOCKING 是这些路径的额外、已实际复现的边界，并非因为缺测试而推断。
- 本轮运行现有 `desktop/database.test.ts`、`desktop/sync.test.ts`、`src/lib/approvalFlow.test.ts`、`src/lib/calculations.test.ts`：**4 文件 27 项通过**。
- 报告不把尚未开展的公网/跨设备、损坏库完整恢复矩阵、参考硬件测试当成已证实代码缺陷；正式发布仍须按交付审计保留这些限制。

## 证据

- `work/review-data-sync-repro.ts` / `.mjs`：原工程模块的临时复现入口；fake IPC 只延迟响应，SQLite 使用真实实现。
- `work/review-data-sync-repro.json`：并发解决、重置、队列丢输入的结果。
- `work/review-budget-repro.tsx` / `.mjs` / `.json`：原 CompanyDrawer 组件的隔离 DOM 复现。
- 所有临时数据库均为本轮 mkdtemp 建立的 `guance-review-*` 测试目录。
