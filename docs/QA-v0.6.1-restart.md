# v0.6.1 快速重启与初始化边界

2026-10-28，Issue #17。Windows CI run40327171063在第一次关闭重开时报告`database is locked`，同提交两种Mac架构已通过；不能将该轮称为三系统全绿。

## 复现与修复

1. 新增独立SQLite写线程持有排他事务，再立即启动LocalDatabase。修复前测试明确失败`database is locked`，定位到journal_mode设置；busy_timeout原来在它之后才设置。
2. 将busy_timeout提前，设置或迁移失败时关闭数据库连接；新测试等待旧写者提交并成功进入WAL。
3. 退出时在Electron `will-quit`阶段等待SQLite所属utility process退出，再释放主进程的单实例锁。`app.quit()`/Cmd+Q不会发送window-all-closed，单独监听后者不足以覆盖退出路径。
4. 额外核查发现页面可调用内部initialize控制命令，导致重新打开本机数据库。原生断言修复前失败`Missing expected rejection`；现在主进程阻止页面发出此命令，保留正常启动内部调用。

退出生命周期依据：[Electron app事件](https://www.electronjs.org/docs/latest/api/app#event-will-quit)、[UtilityProcess退出事件](https://www.electronjs.org/docs/latest/api/utility-process#event-exit)。这项等待不代替异常退出后的SQLite恢复；两条路径分别测试。

## 本机结果

- lint、桌面类型检查、42项单元/集成、构建通过。
- 原生端到端通过：连续3次关闭立即重开、金额/导入结果保留、直接退出后恢复、IPC拒绝initialize、系统加密、JSON下载、包内字体加载检查。
- 未更改数据库版本、用户模型配置、数据目录或业务计算。测试使用独立临时目录。
- 最终三系统CI run40709300542、应用代码提交a7220cf全部通过，包含安装包运行。Windows本机另完成0.6.0→0.6.1实际静默升级及安装后原生回归；证据见RELEASE-v0.6.md。
