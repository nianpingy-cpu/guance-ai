# 观策AI v0.6.1 独立安全审查

- 审查日期：2026-10-28。
- 仓库：`outputs/guance-ai`；审查 HEAD：`18888c4e1c6c4e82d513595082a4e2febba73e96`；交付审计所指应用代码：`a7220cff4b569c2cfb09e97f003de93f56c59774`。
- 审查方式：先阅读 `CONTRIBUTING.md`、`docs/DELIVERY-AUDIT-v0.6.1.md`、`docs/TEST-PLAN-v0.6.md`，再检查当前完整 `desktop/main.ts`、`preload.ts`、`worker.ts`、`service.ts`、`network.ts`、`models.ts`、`collect.ts`、`jobs.ts`、`schema.ts`，并交叉检查 `database.ts`、`sync.ts`、桌面设置与外部正文渲染。不是最后一次提交的 diff 审查。
- 没有修改仓库、读取用户真实 AppData 数据或密钥、调用付费模型/用户远端、发送外部消息或操作 PR。复现使用独立临时 SQLite、虚构凭据和只监听 `127.0.0.1` 的 HTTP 服务。审查完成时 `git status --short` 为空。

## 结论：REQUEST CHANGES

存在两项 BLOCKING 安全边界问题。现有 React 文本渲染、Electron 隔离和命令白名单有实质防护，但不能抵消以下已复现的问题。

## BLOCKING B1 · P1 · 采集地址的校验结果没有约束实际连接，允许私网请求

**位置**：`desktop/collect.ts:28–32`（重点第 31 行）、`desktop/collect.ts:46–48`、`desktop/network.ts:9`。

**触发**：用户启动对攻击者控制域名的公开网页/RSS 采集。`publicURL()` 首先通过 `dns.promises.lookup()` 检查所有地址是否公网，但随后把原始域名 URL 交给全局 `fetch()`。`fetch()` 建立连接时重新解析域名，没有复用已经验证的 IP，也没有验证实际 socket 的目标地址。域名在两次解析间返回不同地址即可使校验时的公网地址和实际连接的回环/内网地址不同。禁用 HTTP 重定向不能防止这一变化。

**影响**：声称仅面向公开网络的采集进程可以向本机或内网 HTTP 服务发送请求，并把返回正文保存为公开来源情报；对具有 GET 副作用的本机接口还会产生相应请求。此次复现确认了本机服务响应进入情报库，没有声称已执行代码、自动向攻击者回传数据或读取任意本地文件。

**复现证据**：任务目录 `work/security-repro.cjs` 将当前源代码直接打包到独立临时目录，经 `DesktopService.execute('collect.start', ...)` 走生产默认 `testing=false` 路径。仅在该测试进程中控制两种 DNS API 的回答，不修改系统 DNS：

```text
publicURL validation: rebind.invalid -> 93.184.216.34
fetch connection:     rebind.invalid -> 127.0.0.1
HTTP test server:     GET /collect, Host: rebind.invalid:<loopback-port>
job.status:          completed
storedBody:          SYNTHETIC_INTERNAL_RESPONSE /collect
```

这证明生产代码对两次解析给出不同答案时没有防护，且实际请求到达本机测试服务。未搭建公网权威 DNS，也没有把受控 DNS 复现标作公网攻击实测。

同一复现还验证 `privateIP('::ffff:7f00:1') === false`、`privateIP('::ffff:a00:1') === false`、`privateIP('::ffff:c0a8:1') === false`，而点分形式 `::ffff:127.0.0.1` 为 `true`（`desktop/collect.ts:23–26`）。在两个 DNS API 均受控返回同一个 `::ffff:7f00:1` 时，实际 IPv6 映射连接也到达同一回环服务并成功入库。该证据确认分类函数漏判及其连接后果；未证明所有操作系统的原生 DNS 解析都会返回这种十六进制映射表示。

**修复建议**：将已验证的地址绑定到实际连接的解析/连接层，保留原始 Host、TLS SNI 和证书校验，并在每次重新解析、重连时重新执行限制；统一解析 IPv4、IPv6 及 IPv4 映射 IPv6 后判定不可公开路由的地址。补充受控重绑定和映射地址测试，断言回环服务零请求、任务失败且项目不新增情报。

## BLOCKING B2 · P1 · 更换连接地址后继续复用原凭据，可由允许的 IPC 把已存密钥发到新来源

**位置**：模型：`desktop/models.ts:30–35`（重点第 32 行），实际发送 `desktop/models.ts:41–47`；WebDAV：`desktop/sync.ts:25`，实际发送 `desktop/sync.ts:28–30`；可调用入口 `desktop/service.ts:12,15,38–40,49,52`。

**触发**：已经保存凭据后，使用原 provider ID 把模型 `baseUrl` 改为另一个 origin，同时 `apiKey` 留空；或更改同步 `url` / `username`，让 `password` 与 `passphrase` 留空。实现直接保留旧 `cipher` / `passwordCipher` / `phraseCipher`，没有检查目标身份是否变化。接着 `models.discover` 或 `sync.test` 就把旧明文凭据发送到新地址。桌面界面也支持这种编辑路径，API 密钥字段明确提示“留空保留已保存密钥”（`src/desktop/ModelSettings.tsx:15,21,23`）。

**威胁边界与影响**：正常用户误把现有连接改成另一个服务时会向新服务暴露原凭据。若渲染进程已被任意脚本执行攻击控制，攻击脚本只需调用现有白名单 IPC，即可把此前仅在本地进程解密的密钥/密码交给其控制的 HTTPS 服务；不需要读取密文或获得 `safeStorage` 接口。此次审查没有发现外部文本导致任意脚本执行的入口，不能把这个前提说成已经实现的 XSS。现有密钥存储隔离在这一合法 IPC 调用组合下仍可被绕过。

**复现证据**：`work/security-repro.cjs` 使用原生产 `DesktopService`，伪 Vault 只处理 `REVIEW_FAKE_*` 虚构字符串，没有读取或解密任何用户凭据；HTTP 没有 mock，接收端是独立回环服务器。先把模型和同步保存为 `http://localhost:1`（保存不发请求），再改成 `http://127.0.0.1:<loopback-port>` 并留空密钥/密码。

```text
models.discover -> GET /models
Authorization: Bearer REVIEW_FAKE_MODEL_KEY

sync.test -> MKCOL /guance-v1/
Authorization: Basic <base64>
decoded Basic: review-user:REVIEW_FAKE_DAV_PASSWORD
```

新 origin 接收到了原 origin 的旧凭据。两个调用均通过服务白名单和输入校验，没有调用私有方法。WebDAV 接收端立即返回 401，不上传任何项目数据。

**修复建议**：在本地服务中把保留的凭据绑定到规范化连接身份。目标 origin/协议变化时要求重新提供模型 API key；同步目标 origin 或账号变化时要求重新提供账号密码，并明确处理独立同步口令。仅修改同一可信服务的普通元信息时才允许空字段沿用原凭据。若产品需要迁移凭据，应通过可信本地确认执行，不能仅由 renderer 提交的标志绕过。补充从已保存连接换 origin、空凭据保存的回归测试，断言拒绝保存或新服务完全收不到旧授权头。

## NON-BLOCKING N1 · P2 · 桌面安全验收的自动化覆盖少于测试计划列出的边界

**位置**：`scripts/desktop-verify.mjs:22–23,41–43`；要求见 `docs/TEST-PLAN-v0.6.md` 的“权限边界”。

该脚本实际验证了 renderer 中 `require/process` 不可用，以及未知命令/`initialize` 被拒绝。未发现对外部导航、弹窗策略、权限拒绝、CSP 阻止脚本/连接、其他 frame/webContents 的 IPC 发起者校验、IPC 大小边界的动态测试。代码中这些防护多数已实现；这里记录的是测试缺口，不是把缺少测试等同于防护失效。

建议增加隔离原生进程的负向用例，并把实际覆盖与只做静态检查的项目分别记入证据。其他审查代理会核查更广泛的测试与采集行为，本项仅覆盖安全边界相关差距。

## 已核对且未发现可确认缺陷的边界

- `desktop/main.ts:62` 明确启用 `contextIsolation`、`sandbox`、`webSecurity`，关闭 `nodeIntegration`；`desktop/preload.ts:4–9` 仅暴露请求封装和关闭回调，没有暴露原始 Electron 对象。
- `desktop/main.ts:54–60` 检查主窗口 webContents 和 senderFrame 来源，阻止 renderer 调用 initialize，限制序列化请求体；`desktop/service.ts:31–34` 使用 own-property 命令白名单和逐命令 Zod 校验。没有任意命令执行或任意文件路径 IPC。
- `desktop/main.ts:26–35` 自定义协议限制 host 和 dist 路径，添加 CSP；`desktop/main.ts:66–68` 拒绝新窗口、限制同源导航、拒绝权限申请。没有因缺少更多防御事件监听而推测一个未复现的绕过。
- `src/pages/SignalsPage.tsx:550–588` 中标题/原文/全文以 React 文本节点展示，外链只允许 http(s)；全项目未发现 `dangerouslySetInnerHTML`、`innerHTML`、`eval` 或 `new Function` 处理外部文本。采集端 HTML 解析不执行脚本，订阅源拒绝 DTD/ENTITY。
- `desktop/models.ts:28,34–36`、`desktop/collect.ts:38`、`desktop/sync.ts:24` 的配置返回值不直接返回存储密文/明文；业务项目 schema 与项目导出不包含凭据设置。凭据跨目标复用问题单独列在 B2，不影响这个事实。
- `desktop/network.ts:9–16` 禁止 HTTP 重定向、使用截止时间并限制读取后的响应总字节；非成功 HTTP 响应不把远端错误正文直接转发给 renderer。数据库业务值使用参数化 SQL；备份文件名由应用生成。

## 复现命令与证据范围

在任务根目录运行：`node work/security-repro.cjs`。Node `v24.13.0`。最近一次完整复现的隔离目录为 `C:\Users\27796\AppData\Local\Temp\guance-security-review-SomBFD`，该目录由本审查创建，只含打包后的复现模块、独立 SQLite 和虚构配置。脚本及运行输出使用的数据均为合成测试数据。

没有运行仓库完整质量/布局/安装验收，也没有重跑其他代理负责的数据同步和采集测试；以上结论来自完整安全代码检查和针对性生产服务复现。静态确认与动态确认已在各项中区分，修复后需重新审查受影响边界。
