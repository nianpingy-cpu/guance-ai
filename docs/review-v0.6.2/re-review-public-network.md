# 网络与模型凭据修复独立复审

结论：**APPROVE**（本次明确范围）。没有发现需要阻断此组修复的问题。

复审者没有编写这组修复。只读核对 `desktop/public-network.ts`、`public-network.test.ts`、`models.ts`、`models.test.ts`，以及 `collect.ts` 中 publicURL / transport 接入、`network.ts` 与生产 `DesktopService` 的调用方式。未修改工程，没有运行原 security-repro，也没有针对外部或内网服务进行攻击复现、读取用户数据或密钥。

## 核对结论

1. **解析结果与连接绑定成立。** `public-network.ts:35–54` 检查 HTTP/HTTPS、无 URL 凭据，对域名只进行一次 `lookup(...,{all:true,verbatim:true})`。所有返回结果均须通过地址分类和 family 一致性检查，第 47–50 行的 lookup 回调只从已核对结果选择；不会重新解析。`68–74` 将这些 options 直接传给 Node HTTP/HTTPS request。IP 字面量也在创建连接前分类。生产采集在 `collect.ts:40–41` 使用 checkedPublicFetch；`service.ts:30` 没有启用 testing 参数，测试旁路没有 IPC 配置入口。

2. **TLS 域名及证书校验保持。** `public-network.ts:54` 保留原 hostname、`agent:false`、`rejectUnauthorized:true`，没有以 IP 替换 HTTP Host，也没有自定义 checkServerIdentity、CA 或 servername 来跳过默认校验。HTTPS 请求第 73 行保留原 URL 并传入固定 lookup；由 Node 标准 HTTPS/TLS 路径处理主机名、SNI 和证书验证。现有单元测试明确断言原 hostname 与 rejectUnauthorized。

3. **重定向不跟随。** Node request 本身没有自动重定向逻辑；`76–77` 拒绝全部非 2xx 并 destroy 响应，3xx 返回要求填写最终公开链接的明确错误。没有把 Location 直接交给其他 fetch 路径。

4. **压缩、大小与取消控制保持。** `57–65` 支持 gzip / deflate / br，对传输字节与解压字节分别计数限额，超过上限通过 pipeline 销毁上游；不支持的编码显式拒绝并销毁响应。`69–78` 把同一个 signal 贯穿解析、request 和 body pipeline；DNS 等待期间取消会提前 reject，解析完成后再次 throwIfAborted，不能在取消后创建连接。`collect.ts:40` 继续合并任务取消与 30 秒上限；写业务前第 84 行仍检查取消。

5. **模型换站点不复用旧密钥。** `models.ts:30–36` 在加密和任何 setSetting 前验证新 URL；已存在连接的 origin 变化且未明确传入 apiKey 时第 32 行拒绝。检查使用标准 URL.origin，包含协议、规范化主机和有效端口。同一 origin 下路径变更保留原密钥，符合服务端点路径调整的用途；不同 origin 提供新密钥后才加密、写入。拒绝路径没有设置写入或网络请求，旧配置保持。测试覆盖原配置未变、同站路径修改和显式新密钥更换站点。

## 执行证据

仅运行现有测试：

`npm test -- --run desktop/public-network.test.ts desktop/models.test.ts`

结果：**2 文件、9 项通过**（2026-10-29 00:08 Asia/Shanghai）。public-network 测试对 DNS 使用 mock；模型协议测试使用代码创建、关闭的独立本机假数据 HTTP fixture，不涉及用户远端、用户凭据或付费模型。没有新增或执行攻击脚本。

`git diff --check` 对本组范围通过。

## 证据边界 / NON-BLOCKING

本复审结论基于代码及纯测试 fixture。没有把固定 lookup 的 options 断言称为真实公网 DNS/TLS 握手验收；没有执行证书异常、真实代理环境或跨物理网络验收。这些证据边界没有暴露本组已证实缺陷，因此不据此阻断修复。

此 APPROVE 不替代数据同步修复的另一位作者复审，也不把整个桌面版本声明为正式发布就绪。

---

## 后续补充复核（2026-10-29 00:50 Asia/Shanghai）

**这是原始报告形成之后的补充，不属于上文原始审查内容。** 本次只读核对 root 新增的域名尾点规范化及性能证据，没有改工程，也没有运行真实网络。

### 官方待开通域名规范化：APPROVE

- 当前 `collect.ts:27–31` 的 validateCollectionURL 先用标准 URL 解析，拒绝非 HTTP/HTTPS 或嵌入账号密码；第 29 行对用于平台判断的 hostname 小写化并移除一个合法 FQDN 尾点，再执行第 30 行精确域名或 `.` 分隔子域名匹配。
- 因此官方待开通列表中的 mp.weixin.qq.com、xiaohongshu.com、xhslink.com、douyin.com、iesdouyin.com 及其子域，不会因大小写或合法单尾点改变而跳过 guard。这个判断仍发生在公开 transport 之前；没有为了规范化而跳过地址分类或连接校验。
- 运行现有 `npm test -- --run desktop/public-network.test.ts`：**1 文件、5 项通过**。新增纯地址 case 覆盖微信尾点、小红书子域尾点、大写 XHSLINK.COM 尾点、抖音子域尾点，均返回待开通。该文件的 DNS 使用 mock，其余用内存压缩流，没有真实网络。
- 这一补充批准针对尾点/大小写修复，不扩展为对全部域名别名或外部平台接口的验收声明。public-network 与模型凭据的其他逻辑沿用原批准范围。

### 两轮性能实际证据复核

读取首轮原始 `work/parallel-performance-first-run-cleanup-error.json` 与最终 `docs/desktop/parallel-performance.json`：

| 项目 | 首轮 | 最终重跑 |
|---|---|---|
| 模式及运行版本 | source-electron-existing-build，0.6.2，Electron 45.0.0 | 同模式、同版本 |
| 情报 / 长原文 | 10000 条 / 1000 条各 1500 中文字符 | 完全相同 |
| JSON 字符 / UTF8 字节 | 8,935,177 / 17,377,408 | 完全相同 |
| 正常 IPC 保存 | 11911.3ms | 10714.3ms |
| 最慢实际界面操作 | 461.8ms | 410.3ms |
| 明确重叠的并行操作 | 12 次 | 12 次 |
| 模型与同步 | 模型 completed；两次同步 completed | 同样完成 |
| 应用与 fixture | applicationClosed=true、remainingPids=[]、fixtureHandlersStopped=true | 同样退出；applicationExitCode=0、testProcessesExited=true |
| 整体结果 | failed，原因是脚本关闭后重新读取已释放 Playwright app.process 句柄的 TypeError | passed，缓存句柄后保持同一负载重跑 |

首轮保留原始 failed 状态；没有把它改成通过。其业务和计时断言已完成，清理记录也显示没有剩余 PID，但 testProcessesExited 因上述脚本异常写为 false。最终重跑记录了 launcher 35156、主进程 8408、GPU 73348、网络 Utility 29236、renderer 17784、Node Utility 52052 的退出，remainingPids=[]，退出码 0，网络 fixture 处理亦已停止。

两轮均在 root 明确宣布统一 0.6.2 build 可开始计时后运行，没有在脚本内重编或使用旧 0.6.1 安装包。硬件记录为 i7-13620H、16 逻辑线程、16,849,256,448 字节内存；固定分块延迟的本机假模型与假 WebDAV，不能改写为 4 核 8GB 或公网真实服务基准。最终远端核对是客户端实际加密上传后，由测试程序用假口令解密核对；没有把它称为第二客户端完整下载验收。
