# 观策AI 桌面试用版 v0.6

本机营销情报与决策工具：采集/导入 → 核实情报 → 模型分析 → 人工编辑审批 → 效果复盘 → 下一轮任务。前台保留四个入口；项目、模型、来源与同步位于设置。

React/Vite由Electron 45承载；独立utility process运行SQLite、模型、采集和同步。初次启动是模拟项目，可创建独立真实业务项目。数据先保存本机；用户自配模型和可选WebDAV。凭据系统加密保存，不进入业务导出或同步。

当前是未签名的内部试用预览，发布门槛尚未全部满足。真实模型、外部WebDAV、社交平台与各系统安装状态请看[发布记录](docs/RELEASE-v0.6.md)，不要将协议测试等同于接通证明。手机端不在本轮范围。

## 启动与验证

要求Node >=24.13、npm；首次安装需联网。

```powershell
npm ci
npm run desktop:start
```

Web预览：`npm run dev -- --host 127.0.0.1 --port 5174`。浏览器是localStorage演示模式，桌面设置和真实任务只在桌面提供。

```powershell
npm run lint
npm run typecheck
npm run typecheck:desktop
npm test
npm run desktop:build
npm run desktop:test
node scripts/desktop-sync-verify.mjs
node scripts/desktop-visual.mjs
node scripts/desktop-performance.mjs
npm run desktop:pack
```

输出release目录。Windows生成x64 NSIS；macOS在macOS构建机生成arm64/x64 DMG。GitHub Desktop Trial工作流分别验证系统。未签名包不等同于正式发行版。

Web操作回归：启动预览，设置BASE_URL后运行`npm run ui:verify`和`npm run ui:visual`；后者覆盖6视口×3档CSS近似缩放×4页。桌面视觉脚本使用原生Electron缩放，覆盖4桌面尺寸×3档缩放×4页及4设置页，共96状态。结果与截图存入docs对应目录。

## 数据、权限与同步

- Windows数据：`%APPDATA%/GuanceAI/data/guance.sqlite`；macOS：`~/Library/Application Support/GuanceAI/data/guance.sqlite`。卸载默认保留；升级迁移、导入和演示重置前备份到data/backups。
- 旧Web迁移：原端口导出JSON→桌面设置→项目与备份→预览校验后导入。重复数据不重复建项目。
- 金额整数分。数据库事务再次检查预算、依据版本和审批快照；普通保存不能改历史审批。依据变化触发复审。
- 密钥使用系统加密，系统安全存储不可用时拒绝保存。模型只发送所选情报和企业资料；不自动重复提交请求；取消仍可能计费。
- 采集支持公开网页、RSS/Atom、CSV/JSON。原文和模型推断需人工核实，来源和任务编号可查。应用关闭期间不执行任务。
- 公众号、小红书、抖音均待开通：本版管理凭据和能力清单，尚未验收官方数据适配器，禁止启动对应任务。
- WebDAV以AES-256-GCM、PBKDF2-SHA256独立口令加密业务版本记录；不同步SQLite文件和凭据。整项目并发修改保留冲突，未选版本另存项目。
- 支持手动及运行期间每分钟同步；离线可编辑。首版同步未做历史归档，最多2万条远端记录；口令不能原地轮换。适合小规模试用。

## 文档

- [安装与手动教程](docs/DESKTOP-GUIDE.md)
- [完整测试方案](docs/TEST-PLAN-v0.6.md)
- [发布门槛与限制](docs/RELEASE-v0.6.md)
- [UI修复](docs/QA-v0.6-ui.md)、[数据库](docs/QA-v0.6-local.md)、[模型](docs/QA-v0.6-models.md)、[采集](docs/QA-v0.6-collection.md)
- [协作要求](CONTRIBUTING.md)、[第三方许可](THIRD_PARTY_NOTICES.md)

私有仓库nianpingy-cpu/guance-ai。遵循Issue→分支→RED/GREEN→PR→独立审查→CI；审查完成前保持Draft、不合并main。历史v0.2/v0.5与旧视频仅供追溯；当前证据以v0.6运行记录为准。验收属于本轮有限检查，不代表持续监控。
