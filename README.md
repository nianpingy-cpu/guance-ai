# 观策AI 桌面试用版 v0.6.2

> 当前版本已从早期浏览器 MVP 升级为 **Electron 桌面应用 + 本地后端**：不是纯前端演示，也不是云端服务端。浏览器预览仅用于 UI 调试。

本机营销情报与决策工具：粘贴/采集/导入 → 核实情报 → 模型分析 → 人工编辑审批 → 效果复盘 → 下一轮任务。前台保留四个入口；项目、模型、来源与同步位于设置。

React/Vite由Electron 45承载；独立utility process运行SQLite、模型、采集和同步。初次启动是模拟项目，可创建独立真实业务项目。数据先保存本机；用户自配模型和可选WebDAV。凭据系统加密保存，不进入业务导出或同步。

当前是未签名的内部试用预览，发布门槛尚未全部满足。0.6.1因独立审查发现的保存/同步问题已撤回试用推荐；新版交付与验证见[0.6.2发行记录](docs/RELEASE-v0.6.2.md)；修复及升级要求见[独立审查与修复](docs/QA-v0.6.2-review-fixes.md)。旧模型、外部服务及安装验证基线见[历史发布记录](docs/RELEASE-v0.6.md)，不将旧证据当作新版已实测。手机端不在本轮范围。

## 当前架构

- **渲染进程**：React + TypeScript + Vite，关闭 Node 集成，只能通过白名单 IPC 访问本地能力。
- **桌面主进程**：Electron 45，负责窗口、安全策略、系统加密存储和应用生命周期。
- **本地后端**：独立 utility process 运行 SQLite、模型调用、公开采集和 WebDAV 同步。
- **数据与凭据**：项目数据持久化在 SQLite；模型密钥、平台凭据、WebDAV 密码和同步口令使用系统安全存储加密，不进入业务导出或远端同步。

这不是云端后端：跨设备能力由用户自备 WebDAV 目录承载，应用本身不托管业务数据。公众号、小红书、抖音的官方数据适配器仍待开通。

## 启动与验证

要求Node >=24.13、npm；首次安装需联网。

```powershell
npm ci
npm run desktop:start
```

Web预览（仅 UI 调试）：`npm run dev -- --host 127.0.0.1 --port 5174`。浏览器模式使用 localStorage 和模拟数据，不能代表桌面端的 SQLite 持久化、模型任务、采集、系统加密或 WebDAV 同步能力。

```powershell
npm run lint
npm run typecheck
npm run typecheck:desktop
npm test
npm run desktop:build
npm run desktop:test
node scripts/desktop-sync-verify.mjs
node scripts/desktop-boundary-verify.mjs
node scripts/desktop-recovery-verify.mjs
node scripts/desktop-visual.mjs
node scripts/desktop-performance.mjs
node scripts/desktop-parallel-performance.mjs
npm run desktop:pack
```

输出release目录。Windows生成x64 NSIS；macOS先运行`npm run desktop:build`，再在macOS构建机运行`node scripts/package-macos.mjs arm64`或`node scripts/package-macos.mjs x64`生成DMG。GitHub Desktop Trial工作流分别验证系统。未签名包不等同于正式发行版。

Web操作回归：启动预览，设置BASE_URL后运行`npm run ui:verify`和`npm run ui:visual`；后者覆盖6视口×3档CSS近似缩放×4页。桌面视觉脚本使用原生Electron缩放，覆盖4桌面尺寸×3档缩放×4页及4设置页，共96状态。结果与截图存入docs对应目录。

## 最简单的情报添加方式

普通用户不需要申请 AppID、密钥，也不需要登录平台账号：

1. **公众号文章**：在微信里打开文章 → 右上角“···”→“复制链接” → 市场情报→粘贴添加 → 读取并添加。支持一次粘贴最多10篇公开文章链接，也可以上传包含公众号链接的 .txt/.csv 列表。
2. **抖音 / 小红书**：在平台点“分享”→“复制链接/复制文案” → 市场情报→粘贴添加 → 选择平台并保存。
3. **批量或固定来源**：使用 CSV/JSON 导入，或高级采集里的 RSS/Atom、公开网页。

应用保存的是“待核实情报”，会尽量保留原文链接、标题和正文，不会登录平台账号，也不会读取密码或 Cookie。遇到微信安全验证时，复制文章全文后用“抖音/小红书文案”保存即可。

## 设置怎么填（可选）

- **普通用户请忽略官方平台凭据**：用“市场情报→粘贴添加”即可，不需要 AppID/AppSecret。官方企业接口仍待开通；AppID/AppSecret 是开放平台应用的凭据，**不是账号密码**，只给公司开发人员或服务商使用，保存后也不会自动登录或启用采集。
- **WebDAV 跨设备同步**：不是必填项，不配置也能正常使用。推荐坚果云：生成“应用密码”，地址填 `https://dav.jianguoyun.com/dav/`，再用“生成”创建至少12位同步口令，点“保存并测试连接”。应用会自动创建 `guance-v1` 子目录，无需手动建文件夹。
- 图文步骤、常见错误和“为什么没有一键登录”，见[设置填写说明](docs/SETTINGS-GUIDE.md)。

## 数据、权限与同步

- Windows数据：`%APPDATA%/GuanceAI/data/guance.sqlite`；macOS：`~/Library/Application Support/GuanceAI/data/guance.sqlite`。卸载默认保留；升级迁移、导入和演示重置前备份到data/backups。
- 旧Web迁移：原端口导出JSON→桌面设置→项目与备份→预览校验后导入。重复数据不重复建项目。
- 金额整数分。数据库事务再次检查预算、依据版本和审批快照；普通保存不能改历史审批。依据变化触发复审。
- 密钥使用系统加密，系统安全存储不可用时拒绝保存。模型只发送所选情报和企业资料；不自动重复提交请求；取消仍可能计费。
- 采集支持公众号公开文章链接、抖音/小红书粘贴文案、公开网页、RSS/Atom、CSV/JSON。公众号只读取用户主动粘贴的公开文章，不抓取账号历史，不绕过登录；需要验证时请复制全文。原文和模型推断需人工核实，来源和任务编号可查。应用关闭期间不执行任务。
- 公众号、小红书、抖音的官方数据适配器均待开通：不提供官方账号登录、关键词搜索或历史文章批量抓取；设置内仅管理企业应用凭据与官方入口，不提供虚假的一键登录。普通用户用粘贴添加，不依赖这些接口。
- WebDAV以AES-256-GCM、PBKDF2-SHA256独立口令加密业务版本记录；不同步SQLite文件和凭据。整项目并发修改保留冲突，未选版本另存项目。
- 支持手动及运行期间每分钟同步；离线可编辑。首版同步未做历史归档，最多2万条远端记录；口令不能原地轮换。适合小规模试用。

## 文档

- [安装与手动教程](docs/DESKTOP-GUIDE.md)
- [设置填写说明：官方平台ID/密钥与WebDAV](docs/SETTINGS-GUIDE.md)
- [设置填写修复与验收](docs/QA-v0.6.2-settings-help.md)
- [粘贴添加与公众号公开文章采集验收](docs/QA-v0.6.2-quick-capture.md)
- [开源采集方案调研：为什么没有直接集成](docs/OPEN-SOURCE-OPTIONS.md)
- [v0.6.1字体设计与验证](docs/QA-v0.6.1-typography.md)
- [完整测试方案](docs/TEST-PLAN-v0.6.md)
- [发布门槛与限制](docs/RELEASE-v0.6.md)
- [UI修复](docs/QA-v0.6-ui.md)、[数据库](docs/QA-v0.6-local.md)、[模型](docs/QA-v0.6-models.md)、[采集](docs/QA-v0.6-collection.md)
- [协作要求](CONTRIBUTING.md)、[第三方许可](THIRD_PARTY_NOTICES.md)

私有仓库nianpingy-cpu/guance-ai。遵循Issue→分支→RED/GREEN→PR→独立审查→CI；审查完成前保持Draft、不合并main。历史v0.2/v0.5与旧视频仅供追溯；当前证据以v0.6运行记录为准。验收属于本轮有限检查，不代表持续监控。
