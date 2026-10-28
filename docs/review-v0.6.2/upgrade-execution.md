# Windows真实0.6.1→0.6.2安装升级验收

**结果：PASS。** 本次为实际NSIS覆盖升级及已安装应用运行，不是仅源码/解包构建验证。执行时间2026-10-29 01:56:42–01:57:41（Asia/Shanghai）。首次实际执行即全部通过，未修改产品代码或用夹具绕过失败。

## 包、目录和隔离

- 安装包：`work/final-ci-v0.6.2/desktop-windows/release/GuanceAI-win-x64-0.6.2.exe`，SHA256 `9bd3ec214a2484ee4e121e126bc735baf767f519c7422c0e87f4f240541f194e`。ZIP/GitHub摘要的上游核验由主代理先完成。
- 安装目标固定为已核对的`work/installed-trial`；真实应用读取版本从0.6.1变为0.6.2，安装前后exe SHA256不同，均isPackaged=true。NSIS静默安装退出码0，约33.7秒。
- 同一新隔离`GUANCE_TEST_DATA`：`work/upgrade-v0.6.2-data-k1TZws`，前后实际app.getPath('userData')均严格匹配。未触及正常应用数据或结束正常用户进程。
- 单个假模型HTTP服务始终监听`http://127.0.0.1:60147`，跨越旧版准备、安装等待、新版验收；仅2次本机POST且均认证成功，未调用真实服务商/采集/WebDAV。升级后未再次models.save或填写密钥。测试服务和应用均已退出；主代理可独立使用已安装0.6.2做后续自动同步，我不会再运行或重装程序。

## 实际检查

1. 旧0.6.1在隔离真实业务项目中保存500049分，设置虚构模型凭据/默认模型；通过正常策略UI生成1份人工审批，通过正常复盘UI录入123.45元、10000曝光、500点击、25咨询。
2. 新0.6.2首次启动逐项比对整个业务数据，审批/复盘/模型设置原样保留。旧系统加密测试密钥在同一origin实际解密并认证。
3. 在新版正常企业资料抽屉中确认预算输入值为`5000.49`，仅更改营销目标并保存；公司其他字段、全部plans/signals/sources/decision/feedback/审批/复盘等快照均保持一致，除预期的goal与company.updatedAt。预算仍为500049分。
4. 当前SQLite schema=3，有2个项目和2个根检查点。原8条changes的schema2七列全部保留；最终11条（2个迁移检查点+1次目标编辑）。审批hash、复盘hash、加密设置hash前后相同。
5. 自动备份`guance-2026-10-28T17-57-33-208Z-09e91f83.sqlite`可只读打开、quick_check=ok，仍schema2，旧项目完整快照、审批/复盘、8条旧changes及加密设置均与升级前一致。当前库和WAL未出现虚构密钥明文。

## 证据

- `outputs/guance-ai/docs/desktop/windows-upgrade-v0.6.2.json`：实际机器/版本、包与exe hash、安装进程退出、数据hash、备份检查、模型认证和清理结果。
- 同目录`windows-upgrade-v0.6.2-before.png`：旧版人工审批和复盘。
- `windows-upgrade-v0.6.2-goal-edit.png`：新版仅编辑目标的抽屉。
- `windows-upgrade-v0.6.2-after.png`：新版审批/复盘仍可见，表格计划预算明确显示¥5,000.49，人工输入123.45/10000/500/25保留。本人已读取并视觉核对三图。
- helper：`work/upgrade-v0.6.2.mjs`，此前node --check及独立静态复核APPROVE；实际执行无测试逻辑改动。独立静态复核记录：`work/upgrade-v0.6.2-static-review.md`。

范围：本轮证明Windows同机静默覆盖升级及隔离数据迁移/保存，不代表人工安装向导、签名、公证、真实用户数据升级矩阵或跨设备验收。
