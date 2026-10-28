# Windows 0.6.2 升级 helper 静态复核

2026-10-29（Asia/Shanghai）。对象：`work/upgrade-v0.6.2.mjs`。**最终静态结论：APPROVE，可在主代理提供实际 CI 安装包后执行；本轮未执行。** 初轮包含第 66 行 `SELECT id,body FROM changes`、改目标后的局部数据比较，曾因以下两处验证缺口 REQUEST CHANGES。作者已修订，本人重新读取确认，最终复核记录见文末；这不构成产品升级已经通过的结论。

本轮只读文件并静态分析，没有运行 helper、应用、安装器或本机 HTTP fixture，也没有访问任何 SQLite/用户数据。作者另行运行过的 `node --check` 不在本次重复执行。

## 需要加强的验证

1. **旧 changes 的“完整保留”尚未被证明。** `sqliteSnapshot:66` 只保存每条变更的 id 和 bodyHash，`:247`、`:254` 因而无法发现 project_id、parent_revision、revision、created_at、resolves 被改写。此类改动会通过当前断言，但旧事件的关联/版本语义已经变化。建议按全部 schema2 列记录并逐字段比较；schema3 新增列可独立校验，不把新检查点计为旧记录改写。
2. **“新版 UI 只改 goal”目前只对部分数据成立。** `:231–236` 核对公司字段、预算、approvals/reviews，却不比较 plans、sources、signals、themes、feedbackTasks、decision、analyses 等剩余业务字段。如果保存目标时意外覆盖其中任一项，当前 helper 仍可报告通过。建议用升级前整个 data 的副本，只替换 company.goal，统一或忽略 company.updatedAt 后与 edited.data 深度相等比较。

已即时将以上问题发给作者及主代理。此处行号是本次读取版本的定位，后续改动可使行号变化。

## 静态核对可接受的部分

- 安装目录固定从脚本所在 work 的 realpath 派生为 installed-trial，拒绝安装目录或 exe 指向其他真实路径；测试目录由 mkdtemp 在同一 work 新建，不能通过参数覆盖，也不在安装目录之内。所有这些检查在启动/打开数据库之前进行。
- 升级前后使用同一个 env 对象和 GUANCE_TEST_DATA；每次启动实际核对 app.getPath('userData')、isPackaged 和预期应用版本；不读取正常 AppData。
- 本机 HTTP server 在旧版、安装阶段、新版之间保持同一个监听端口；提供者升级后不再 models.save，核对 baseUrl/defaultId/model/hasKey 并实际用旧密钥认证。最终要求两次请求均通过认证，报告不包含明文测试密钥。
- NSIS 通过 spawn 直接执行，shell=false、windowsVerbatimArguments=true，只对 argv0 单独加引号；`/S` 在前，`/D=...` 为最后且未加引号的参数。静态形式符合脚本明确采用的 NSIS 规则；没有在本次实际验证安装器命令行解释。
- 旧业务使用真实项目和 500049 分预算；通过界面审批、录入复盘；新版首次启动前先深度比较完整旧业务，随后通过界面检查 5000.49 并只编辑目标。
- 结束时要求 schema3、parent_ids 列、项目检查点、模型设置 hash 不变，升级新生成备份可读且 schema2 业务与旧设置相等。除上述旧变更字段缺口外，此逻辑能区分新检查点与旧记录保留。
- finally 只关闭本脚本的 app handle 与自己创建的 HTTP server，不扫描/终止其他 Node/Electron 进程；结果只写工程 docs/desktop，保留独立测试目录作追溯。

## 可靠性建议

`closeApplication:163` 及失败清理调用 app.close 后没有显式等待 app.process() 的确切 exit。建议沿用恢复验收脚本的退出等待，再读取 SQLite 或启动安装器，避免把 IPC/浏览器关闭当作已释放安装文件和数据库锁。仅等待自己的 ChildProcess，不添加按进程名扫描或批量终止。

本报告是静态预检，不构成真实安装升级、操作系统加密解密或模型请求已通过的证据。实际安装必须等待主代理提供已核对的 CI 安装包后另行执行。

## 修订后静态收尾

作者反馈处理意见后，本人再次只读打开当前 helper，确认：

- changes 查询已覆盖 schema2 全部七列，保存 id/projectId/parentRevision/revision/bodyHash/createdAt/resolves；现有按旧 id 比对及升级备份比对会发现任一旧字段改写。
- 新 UI 只改目标后增加完整 AppData 的 deepEqual，仅按预期替换 company.goal 并从两边去除 company.updatedAt；plans/signals/sources/decision/feedback 等也进入保留验证。
- 正常关闭先在自己的 app.process() 上注册 exit，等待 close 与确切进程 exit，两者完成才继续；30 秒超时抛出错误，不再进入 SQLite 或安装阶段。失败 finally 仍只使用自己的 app handle，不扫描其他进程。

未发现修订后本次范围的 BLOCKING，最终 **APPROVE（静态准备阶段）**。路径保护、同一新测试目录、固定本机 origin/凭据复用、NSIS 参数形式及最初核对的其余隔离逻辑保持不变。本人没有运行脚本、应用、安装器或探针，也未以静态批准代替真实安装证据。
