# 数据与同步修复交接（待其他作者独立复审）

基线独立审查仍记录在 `review-data-sync.md`，结论 REQUEST CHANGES；以下是审查后获授权进行的修复，不能把作者自测当成独立复审。

## 已修改

- `src/desktop/client.ts`：待保存快照按项目 ID 分组，携带自己的基线；旧项目保存响应不会改变当前项目身份。普通保存失败保留最新可见草稿和待保存队列，可重试。CONFLICT 时先把在途保存之后的最新输入也可靠写入冲突版本，再恢复远端项目；重新加载期间的输入同样保留。切换项目加载后再排空旧项目保存。
- `CompanyDrawer.tsx`：企业预算输入初始化保留两位小数，500049 分不会在打开/保存后变成 500000 分；1 分亦可往返。
- `desktop/database.ts` / `schema.ts`：SQLite 版本 3，新事件使用独立 UUID 和明确的 parents 事件 UUID；内容 revision 继续用于内容摘要与乐观保存。解决冲突产生新事件，父事件包括当前主分支与所有已见冲突。两端同时解决会形成可见的新冲突，再处理后收敛；新重置即使内容回到历史值也会传播。缺精确父事件的记录不通过内容 hash 推导因果。
- `desktop/sync.ts`：manifest.version=2 与 GCM 上下文 guance-v2，拒绝旧协议；仅上传有精确 parents 的新事件。跨 origin 或账号更改必须显式提供新密码；更换目录必须显式填写同步口令，可明确输入原口令迁移。所有检查在本机配置写入前完成，失败保留旧配置。
- 测试：`desktop/client.test.ts`、`desktop/database.test.ts`、`desktop/sync.test.ts`、`src/features/company/CompanyDrawer.test.tsx`。

## 迁移与并存的实际行为

1. 本机数据库 v1/v2 → v3：先 VACUUM INTO 留下可读旧版备份，再在一个事务内加 parent_ids / project_heads。原 changes 留在本机审计日志，不删除；当前项目和每个未解冲突各产生新的独立根检查点。旧日志不上传到新协议目录；当前项目中的历史审批、复盘及业务内容随检查点传输。升级出错时模式与业务均回滚，备份仍可读。
2. 远端旧 v1：**不自动转换、不删除、不覆盖远端**。新版只 GET manifest，然后明确报错。所有设备升级后，配置同一个新的空 WebDAV 基础目录。各端本机现有项目和未解冲突会作为明确检查点上传；多端检查点不能确定因果时保留冲突。
3. 新目录仍使用 `guance-v1/` 作为固定发现子目录，但清单协议版本为 2。这是有意保留的发现点，使旧客户端不能绕过新版协议清单另建同路径版本。
4. 原 v0.6.1 的实际 SyncService（从 git show 18888c4 单独构建）连接新版目录时：MKCOL 返回 405，然后 GET manifest，version=1 的旧 schema 拒绝 version=2；没有上传 op。新版连接旧目录仅 GET 后拒绝。两个 manifest 字节均未变。证据：`sync-protocol-compat.json`。
5. 旧版应用不能直接打开 SQLite v3；需要新版应用，回退时使用升级前备份。不要宣称 v1/v2 协议可混用。

旧远端提示原文：

> 此目录使用旧版同步协议。请先升级所有设备，再配置同一个新的空WebDAV目录；旧目录保持不变，本机数据及升级前备份保留

换站点或账号且空密码：

> WebDAV站点或账号已改变，请重新填写目标站点密码

换目录且空口令：

> WebDAV目录已改变，请明确填写目标目录的同步口令；迁移时可填写原口令

## 验证

- RED：`data-fixes-red.log`，原实现 7 项失败，覆盖丢等待输入、普通写入失败覆盖草稿、并发解决静默分叉、重置不传播、跨站凭据复用、预算小数取整。
- 补充跨项目 RED：`data-project-queue-red.log`，第一项目被第二项目内容错写。
- 最终定向 GREEN：`data-fixes-scoped-final.log`，4 文件 27 项通过。含精确父事件乱序、v1/v2 升级备份、升级中断回滚、旧事件拒绝、冲突检查点保留、重新加载中继续输入。
- lint、前端 typecheck、desktop typecheck 通过。`desktop:build` 通过，`data-fixes-desktop-build.log`；dist / desktop-dist 已刷新。
- 修复过程中一次全量 10 文件 59 项通过；较后全量遇其他作者正在补写的两个安全 RED（models/IPv6），见 `data-fixes-final-tests.log`。最终全仓结果由根代理在所有作者收尾后统一复验。
- 未调用真实模型/用户远端，没有读取用户真实 AppData 密钥，没有提交 Git、发 PR 或外部消息。

独立复审请重点尝试：两端同选与异选的并发解决、解决后又离线编辑、重复内容的新操作、先收到后代事件、旧库已有多个冲突、磁盘失败/恢复、切换项目时旧响应延迟。
