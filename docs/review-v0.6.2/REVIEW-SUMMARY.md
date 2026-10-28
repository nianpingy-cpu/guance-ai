# v0.6.2 独立审查汇总

2026-10-29（Asia/Shanghai）。代码范围复审结论：**APPROVE；最终提交 Quality 与三系统 Desktop Trial 均已通过。工件已下载并核对GitHub摘要，Windows实际NSIS覆盖升级及正式发布验收仍另行记录。** PR 保持 Draft，尚未放行合并或正式发布。

审查基线为 `fix/17-restart-lock` 的 `18888c4e1c6c4e82d513595082a4e2febba73e96`，当前代码为 `fix/19-review-blockers` 的 `99087b4fbb9af5899af34a810ca6cd117555b46c`。主要修复提交是 `a4828063dc8614ead4dee3dbc374439b0e509036`；最后的 `99087b4` 仅把策略保存提示及复盘标签中的“本机浏览器”改为“本机”，没有结构或逻辑变化。本轮开始时修复尚在工作区，之后已核对实际提交 diff 与最终 PR head，没有将最初为空的分支比较视为审查通过。

## 初审、修复与独立结论

原始 REQUEST CHANGES 报告均保留，不因后续修复而改写为 APPROVE。后续独立结论按实际修复范围接续：

| 范围 / 初审阻断 | 后续独立复审 | 当前代码结论 |
|---|---|---|
| [数据初审 1–6](review-data-sync.md)：等待输入丢失、跨项目错写、并发复决静默分叉、重置/ABA 不传播、小数预算、WebDAV 凭据跨目标复用 | [数据独立复审](re-review-data-sync.md)确认原六项场景已解决，同时发现新的 D7 并保持 REQUEST CHANGES。该复审者未参与原数据修复 | 原六项已通过另一作者独立复核；不能只引用该报告标题而忽略后续 D7 |
| D7：任务完成或同项目刷新用旧快照覆盖继续输入 | [D7 修复交接](d7-refresh-fix-handoff.md)后，由另一作者完成[D7 独立复审](re-review-d7-refresh.md)，12 项队列回归通过 | APPROVE，任务/轮询/同项目切换/重置/去重导入接入安全刷新 |
| 两任务面板切换项目后的旧行、晚响应与 A→B→A 状态污染 | [面板独立复审](panel-project-scope-independent-review.md)：每次访问的 scope 身份、实时项目检查及等待保存后的二次检查；19 项组件 + 12 项队列测试通过 | APPROVE，正常启动/取消/重试仍可用；旧任务在原项目后台运行，不能更新新访问的面板 |
| [安全初审 B1](review-security.md)：地址分类与实际连接不一致、映射地址漏判 | [网络独立复审](re-review-public-network.md)：固定已核对解析结果，保留 Host/TLS 校验，检查压缩前后限额、取消及不跟随重定向；后续补核域名尾点与大小写 guard | APPROVE，未重新执行攻击探针；使用源码和假数据单元证据 |
| 安全 B2：模型或 WebDAV 更换连接目标时沿用旧凭据 | 模型部分见[网络/凭据复审](re-review-public-network.md)；WebDAV 部分见[数据独立复审](re-review-data-sync.md)。本轮另核对平台 appId 更换时空 secret 也在写设置前拒绝及对应回归 | APPROVE，UI 说明与后端保留规则一致，失败不改旧设置 |
| [采集初审 C1/C2](review-collection-validation.md)：混合 JSON 空项取消整文件、Atom 正文丢失与零结果误完成待办 | [采集独立复审](re-review-collection.md)确认 C1 和常见正文/计数已解决，但发现前缀非正文残留 R1，因此当时仍为 REQUEST CHANGES | 初始修复批准必须结合下一行的 R1 关闭证据 |
| R1：带 XHTML 前缀的非正文文本被当作有效证据 | 不同作者修复并经[前缀清洗独立复审](re-review-collection-prefix-fix-review.md)批准，包含独立 fixture | APPROVE，纯非正文新增 0 且关联待办保持 open |
| 后续发现的标准 Atom 标题、命名空间及 xml:base 链接问题 | [Atom 标准独立复审](atom-standards-independent-review.md)核对另一作者实现，定向 24 项及独立命名空间/链接 fixture 通过 | APPROVE；保留 RSS/旧无命名空间兼容路径，不宣称覆盖所有 Atom 扩展 |
| [打印初审 P2/P3](print-initial-review.md)：A4 复盘表右侧裁切、策略打印交互选择器与低信息尾页 | [打印独立验收](../print-v0.6.2/PRINT-CHECK.md)逐页查看实际 12 页渲染；本轮另复核源码及代表页 | APPROVE，九列/静态金额和计数完整，模型/采集面板从报告隐藏；限所述 source build/A4/演示场景 |

安全初审 N1 的证据缺口已补充[八项桌面边界契约](../desktop/boundary-results.json)：Node 权限关闭、隔离世界、CSP inline/connect 强制事件、导航、弹窗、通知拒绝、另一隐藏窗口的 IPC 身份拒绝。它没有宣称覆盖所有安全测试；超限 IPC 负向请求等未在该脚本中新增实测。采集初审对测试标题、403/429/5xx/超时及中断矩阵的证据限制也不能仅凭测试数量增长视为全部关闭。

## 本轮最后只读核对

本轮复审者是原数据/同步、预算和初版队列修复作者，因此这些实现的批准只引用未参与修复的另一作者报告，**不以本人的自查替代独立批准**。本人直接独立复核的其他作者改动包括：

- 模型 origin 变化的显式新密钥规则、平台 appId 变化的显式新 secret 规则，均在加密及 setSetting 前校验；原站点普通元信息编辑仍可保留密钥。
- public-network 的同批地址固定连接、TLS 校验、压缩/大小/取消控制；采集纯 URL guard 在 transport 前完成协议/凭据/平台判断。
- JSON 逐行类型校验、Atom 有序文本及命名空间读取、xml:base 解析、非正文清洗和零有效结果的待办语义；没有发现新的覆盖业务或伪成功路径。
- 两任务面板每次项目访问的响应身份、D7 安全刷新与 AppShell/Settings/SyncSettings 的接线。
- 打印的静态数值源、null/0 表示、解除横向裁切及表格纸宽约束。查看实际复盘第一页九列和策略末页，结果与独立打印报告相符。`99087b4` 提交中的两处短文案尚未在旧 PDF 中重绘，不把该 PDF 冒称最终安装包输出。
- 当前依赖清单无新增运行时依赖；package/lock 版本升级为 0.6.2。CI workflow 增加本分支、源码及打包后边界/恢复验收，未删除既有质量门槛。

本轮未发现新增 BLOCKING。只运行本地现有测试，没有付费模型、用户配置/密钥读取、用户远端请求或攻击任务；未修改业务代码。

## 测试及执行证据

在最终 `99087b4` 上，本轮独立执行：

| 检查 | 结果 |
|---|---|
| `npm test` | **12 文件、108 项通过**，2026-10-29 01:39，含临时 SQLite、组件假 IPC、内存压缩流及本机假 HTTP fixture |
| `npm run lint` | 通过 |
| `npm run typecheck` | 通过 |
| `npm run typecheck:desktop` | 通过 |
| `git diff --check` | 通过；文档 CRLF→LF 提示不是检查失败 |

现有执行记录的范围分别保留：

- [原生端到端](../desktop/results.json)、[八项边界](../desktop/boundary-results.json)、[损坏库/迁移失败恢复](../desktop/recovery-results.json)属于本机源码构建记录；故障注入不是实际磁盘故障。
- [长正文并行性能](../desktop/parallel-performance.json)：10000 条合成情报，其中 1000 条各 1500 中文字符原文且 quote 同样保留；17,377,408 字节正常 IPC 负载，保存 10714.3ms，20 次实际界面操作最慢 410.3ms，12 次覆盖有效模型响应流与密文上传同时活动，模型及同步完成。使用 i7-13620H、16 逻辑线程、约 16GB 内存及带固定分块延时的本机假服务；没有替代 4 核 8GB 或公网基准。该计时早于最后面板/打印改动，不能冒充后续所有 UI 改动的重复性能验收。
- 性能首轮的清理脚本异常原始 failed 记录保留；同负载重跑后主进程、launcher、renderer、GPU、Network Utility、Node Utility 全退出，exitCode=0、remainingPids=[]、fixtureHandlersStopped=true。没有用未结束任务冒充完成。
- [打印验收](../print-v0.6.2/PRINT-CHECK.md)是 source build 的 A4 演示输出；[公开 RSS 记录](../desktop/public-collection-v0.6.2.json)是其所载系统与时间的真实读取，不作为每个平台重跑的证明。
- CI 上传整个 docs 目录可能包含历史本机性能、RSS、打印或模型记录。只有 workflow 实际运行且工件元数据匹配的检查可计为该系统本轮执行，不能把继承文件当作所有系统重新调用了外部服务。

## 最终 CI 与剩余门槛

2026-10-29 01:44（Asia/Shanghai）只读查询快照：[PR #20](https://github.com/nianpingy-cpu/guance-ai/pull/20)为 **OPEN / Draft**，base=`fix/17-restart-lock`，head=`99087b4fbb9af5899af34a810ca6cd117555b46c`。PR 身份在 01:39 查询，01:44 再核对最终 head 的下列运行状态。

| 最终提交检查 | 查询时状态 |
|---|---|
| [Quality：push](https://github.com/nianpingy-cpu/guance-ai/actions/runs/40737678363) | completed / success |
| [Quality：PR](https://github.com/nianpingy-cpu/guance-ai/actions/runs/40737686347) | completed / success |
| [Desktop Trial：Windows / macOS arm64 / macOS x64](https://github.com/nianpingy-cpu/guance-ai/actions/runs/40737678310) | in_progress，尚无最终结论 |

中间提交 `a482806` 的成功 Quality、旧 0.6.1 的全绿 CI，以及本机测试均不能替代上述最终提交检查。此表是有时间戳的快照，后续状态应由实际新记录更新，不能据此预先写成成功。

最终提交的 Quality 门槛已满足；合并前仍需三系统 Desktop Trial 完成并处理失败。最终 0.6.2 安装包须来自同一已验提交，核对摘要、升级及打包后边界/恢复记录。当前代码审查通过不等于已有新三系统安装包。

正式发布仍保留：用户自有 WebDAV/跨物理设备、目标机器人工安装与升级、Mac 签名/公证和 Gatekeeper、官方平台权限与真实适配器、参考硬件/OS DPI、全部故障与历史升级矩阵、商业参考素材许可。同步协议 2 不自动改写旧 v1 远端，所有设备升级后使用同一个新的空基础目录；旧目录及升级前本机备份保留，详见[桌面教程](../DESKTOP-GUIDE.md)。这些尚待验收的门槛不被改写为已经完成，也不被直接推断成已证实代码缺陷。

---

## 后续最终 CI 核对（2026-10-29 01:51:50，Asia/Shanghai）

**本节更新上文 01:44 的进行中状态，原快照保留为历史。** 已通过只读 GitHub 元数据查询核对最终代码提交 `99087b4fbb9af5899af34a810ca6cd117555b46c`：Quality 两次运行与 Desktop Trial 均为 **completed / success**。完整运行、三个实际 job、所有步骤结论及核对条件已保存为 [final-ci.json](final-ci.json)，观察时间 `2026-10-28T17:51:50.726Z`。

| 最终提交的 Desktop Trial 实际 job | 结论 | 完成时间（UTC） |
|---|---|---|
| [Windows，122991276024](https://github.com/nianpingy-cpu/guance-ai/actions/runs/40737678310/job/122991276024) | success；`npm run desktop:pack` 成功 | 2026-10-28 17:48:03 |
| [macOS Intel/x64，122991276636](https://github.com/nianpingy-cpu/guance-ai/actions/runs/40737678310/job/122991276636) | success；`package-macos.mjs x64` 成功 | 2026-10-28 17:49:40 |
| [macOS arm64，122991277086](https://github.com/nianpingy-cpu/guance-ai/actions/runs/40737678310/job/122991277086) | success；`package-macos.mjs arm64` 成功 | 2026-10-28 17:42:45 |

三 job 均来自 [Desktop Trial run 40737678310](https://github.com/nianpingy-cpu/guance-ai/actions/runs/40737678310)，headSha、分支和最终代码提交一致。逐项核对 `npm ci`、lint、前后端类型检查、单元/集成测试、桌面构建、原生端到端、源码边界、源码恢复、双实例同步、原生视觉、长文本布局、对应平台打包、`Verify packaged app`、`Verify packaged permission boundary`、`Verify packaged recovery`、工件上传均为 success；没有以整个 run 的绿色代替关键步骤检查。三个 job 的其余 setup/post 步骤也全部成功。

同一 head 的 [Quality push 40737678363](https://github.com/nianpingy-cpu/guance-ai/actions/runs/40737678363) 与 [Quality PR 40737686347](https://github.com/nianpingy-cpu/guance-ai/actions/runs/40737686347) 亦已再次确认 success。只读取元数据，没有触发、重跑或改写工作流。PR #20 查询仍为 OPEN / Draft，未据此执行合并。

**目前已满足：所述代码独立复审及最终代码提交的 Quality / 三系统 Desktop Trial 自动检查。** 以下交付与外部门槛尚未由本次核对完成：

- 最终 0.6.2 工件下载到本机后的摘要核对、ZIP/安装包对应关系与交付目录整理仍在主流程进行中。本复审没有下载或计算这些工件字节的摘要，因此不在此写成已验证。
- Windows CI 的 `Verify packaged app` 使用 `release/win-unpacked/观策AI.exe`，不能证明 NSIS 安装向导或从已装旧版执行覆盖升级成功。主流程稍后将产生本机 NSIS 覆盖升级记录；本节形成时该步骤尚未完成。
- 用户自有 WebDAV/跨物理设备、目标机器人工安装、Mac 签名/公证/Gatekeeper、官方平台真实授权、参考硬件/OS DPI、完整故障与历史升级矩阵及商业参考素材许可仍保留为外部门槛。

本机性能、真实 RSS、打印记录保持各自原有执行范围；它们没有因为随 CI 工件上传而变成三系统重新执行的记录。待主流程产生新的下载/升级证据后，应追加其实际结果，保留本节时间戳。

## 主流程交付复验补充（2026-10-29 02:02，Asia/Shanghai）

本节由主流程追加，保留前述独立审查快照，不将新增执行冒称复审者亲自运行。

- 三个工件ZIP已下载，摘要与GitHub一致，记录在`artifact-downloads.json`；实际核对每系统96普通/48长文本、打包后边界/恢复均通过。
- Windows真实NSIS覆盖升级由采集修复作者执行、恢复作者静态复核helper；[实际结果](../desktop/windows-upgrade-v0.6.2.json)与[执行交接](upgrade-execution.md)。旧500049分、审批/复盘、默认模型、同origin旧密钥认证、完整历史日志及schema2备份一致，schema3自动迁移成功。只改目标后其余完整业务数据保持。
- 主流程在该已安装0.6.2再次完成原生端到端、8项边界、损坏备份恢复与中途迁移回滚。相应`desktop/results`、`boundary-results`、`recovery-results`链接现更新为安装后本机复验元数据；不能把历史段落里的源码构建描述套到新元数据上。
- [安装后分钟同步](../desktop/automatic-sync-v0.6.2.json)：60.200秒观察到自动上传，无手动源端触发；协议2、独立真实hacdias服务器、第二桌面实例接收一致，服务器已停止。同一物理电脑，不是用户公网跨设备。
- 安装包98个离线字体文件及OFL完整通知实际核对。源代码除README/docs记录外与CI99087构建相同；最终交付逐文件摘要另行生成核验。

以上补充不改变未签名/公证、Mac人工安装、用户远端/跨物理设备、官方平台权限、参考硬件与商业素材许可等剩余项，也不自动合并main。
