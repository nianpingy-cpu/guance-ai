# v0.6.1桌面试用验收与发布门槛

> 历史记录，推荐已撤回（2026-10-29）。后续独立审查发现保存与同步阻断问题；本页旧绿测不能覆盖这些缺陷。请先导出备份，参见[0.6.2修复记录](QA-v0.6.2-review-fixes.md)。0.6.1不再用于真实业务与同步。

更新于2026-10-28。当前交付为未签名内部试用构建，四个主入口和本地业务闭环已可运行；新增统一离线字体及快速重启修复。正式发布与合并main仍需独立审查及下述外部验收。

## 实际通过

- lint、前后端类型检查、构建、42项单元/集成测试通过。
- Web 22项交互回归、72组视口/缩放检查通过；桌面96组页面/设置窗口、48组长文本场景通过。
- Windows、macOS Apple Silicon、macOS Intel的CI均通过，包含原生窗口、SQLite重开/直接退出恢复、系统加密、CSV导入、JSON实际下载、双实例同步、图表检查和打包后运行。
- 最终v0.6.1代码构建：[Desktop Trial 40709300542](https://github.com/nianpingy-cpu/guance-ai/actions/runs/40709300542)，分支fix/17-restart-lock，构建提交a7220cff4b569c2cfb09e97f003de93f56c59774，三系统均成功。Quality 40709300521亦成功。后续交付记录提交不变更应用代码。
- Windows NSIS实际静默升级0.6.0→0.6.1并运行；独立测试项目的预算/目标/默认模型保留，旧系统加密测试凭据在新版实际解密并通过本机服务认证。新版安装后再次通过原生端到端。macOS DMG在各架构CI中执行校验、挂载、复制应用和启动，不能称为人工安装验收。
- 用户自行保存的deepseek-flash已设为默认。代理提交分析2次：首次返回无法解析为JSON，原方案保留；启用JSON输出、简短结构示例与DeepSeek非思考模式后，第二次约7秒生成5主题、A/B方案，引用/预算/保存校验通过。输入为独立项目的5条模拟情报，未自动审批，密钥未进入记录。
- 真实公开RSS https://blog.rust-lang.org/feed.xml 读取10条，新增10条，均有来源/时间/任务号/内容摘要；不构成社交平台授权证明。
- 独立hacdias/webdav v5.17.2服务器（官方校验和验证）已在本机真实运行：两个独立Electron数据目录经Basic认证同步，服务器落盘加密记录，并发冲突处理后两端一致。测试后服务器已停止；不是公网或跨物理设备验收。
- 新版已安装程序另测一分钟自动同步：源端未调用手动sync.run，约60.176秒后自动上传3个加密文件，第二个已安装实例接收项目且版本一致；独立真实服务器测试后已关闭。
- 四页与表单/图表使用离线Noto Sans SC Variable；实际加载和本地字体请求检查通过。字体替换引出的两处390px/150%溢出已修复；真实模型旧结果在隔离项目重新检查，无新增模型调用。快速重启锁竞争与内部initialize调用均有RED/GREEN证据，见对应QA文档。
- 1万条合成短文本在i7-13620H/16GB开发机筛选约63ms，批量保存约5.7秒。不是4核8GB、长正文或并行压力基准。
- npm audit当前0项报告；运行时许可证随包分发。图表是独立React/SVG实现，参考仓库不是React组件包。

## 仍未完成或受限

| 项目 | 实际情况 |
|---|---|
| 用户自有远端WebDAV/跨物理设备 | 未实测；本机真实服务器与双进程已测 |
| 公众号/小红书/抖音 | 官方适配器及获批权限尚未验收，均待开通，不允许启动对应任务 |
| 签名/公证与人工安装 | 未配置签名公证；未做人工向导/Gatekeeper安装验收 |
| 独立审查 | 未完成，各阶段保持Draft，未合并main |
| OS DPI与目标硬件 | 已测Electron原生内容缩放；OS DPI、4核8GB硬件、长正文和并行任务仍需专门复测 |
| 同步范围与粒度 | 全部本机项目的业务版本；整项目冲突选择，未选版本保留。未做历史归档，远端最多2万条记录；口令不能原地轮换 |
| 网页能力 | 不执行脚本、绕过登录或自动跟随重定向；动态内容可改用最终公开链接/导入；订阅每次最多100条 |
| 恢复与升级 | JSON导入、迁移前备份、备份可读、Windows0.6.0→0.6.1静默安装升级已测；损坏数据库恢复界面、所有历史版本与Mac人工升级未全测 |
| 审计定位 | 本机管理员和同步口令持有者可以控制文件；应用内快照不等同于独立签章 |
| 图表参考许可 | 原Lieflat为PolyForm Noncommercial；商业分发前需处理相关参考素材/配色许可来源，当前不宣称已获商业授权 |
| 手机端 | 本轮未实施；协议可复用，具体平台与UI后续确定 |

## 证据

- desktop/real-model.json、real-model-first-attempt.json：真实模型成功/失败记录；real-model-strategy.png与real-model-ui.json为结果截图及碰撞检查。
- desktop/public-collection.json：真实RSS记录。
- desktop/sync-real-server.json：独立真实WebDAV服务的双实例测试；sync-results.json为可重复协议测试。
- desktop/results.json、performance.json：本机原生测试及性能。
- desktop/windows-upgrade.json与windows-upgrade.png：实际Windows安装升级；automatic-sync-real-server.json：已安装双实例与一分钟自动同步。
- QA-v0.6.1-typography.md、QA-v0.6.1-restart.md与typography/：新字体、手机放大溢出修复及快速重启RED/GREEN。
- desktop-visual/results.json、desktop-long-text/results.json：正常及长文本；visual/before-results.json为首轮54/72失败基线，macos-before-results.json为跨系统12处字体碰撞基线。
- 各操作系统CI工件是该系统独立运行记录，不能用本机截图代替。
