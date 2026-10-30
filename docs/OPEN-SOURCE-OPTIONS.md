# 开源采集方案调研（2026-10-30）

目标：寻找能补齐公众号历史文章、抖音/小红书关键词搜索或批量采集的开源项目或油猴脚本，并判断是否适合本应用的非技术用户（企业高管、市场人员）。

## 评估标准

1. **非技术可用**：不要求 Python、uv、Node、F12、Cookie、命令行或改配置文件。
2. **账号安全**：不把用户密码、Cookie、token 交给第三方或写进仓库。
3. **合规与平台条款**：不绕过登录/验证码，不宣传大规模抓取。
4. **可持续**：上游接口变化后仍有人维护，有明确许可证。
5. **可集成**：许可证允许商业使用，最好能作为独立工具或通过文件导入，不需要复制代码进本应用。

## 微信公众号

| 项目 | 数据/能力 | 技术门槛 | 许可证/维护 | 结论 |
|---|---|---|---|---|
| [wechat-article/wechat-article-exporter](https://github.com/wechat-article/wechat-article-exporter)（13k stars） | 批量导出公众号文章、阅读量、评论 | 网页/Docker，需扫码登录公众号后台 | MIT；**2026-07-30 已停止维护**，上游接口关闭 | 不可作为长期方案 |
| [qiye45/wechatDownload](https://github.com/qiye45/wechatDownload)（9.9k stars） | GUI 批量下载公众号历史文章、导出 CSV | 需微信客户端、复制链接到微信打开获取密钥 | **无许可证**；最新 release 4.7 标注“已失效” | 不能打包分发，稳定性不足 |
| [lunnlew/weicai-scraper](https://github.com/lunnlew/weicai-scraper)（88 stars） | 公众号历史文章采集管理 | 桌面工具 | MIT；**2021 年已归档** | 不可用 |
| [lehh666/get-WeChat-OA](https://github.com/lehh666/get-WeChat-OA)（2 stars） | 单篇/按名称发现/专栏导出/GUI | Python、浏览器自动化；依赖搜狗/Bing/DDG | 小型新项目，未验证稳定性 | 只能作为技术参考，不集成 |
| 油猴脚本（Greasy Fork 常见） | 当前文章导出 Markdown/PDF/HTML | 需安装 Tampermonkey；逐篇操作 | 多为个人脚本 | 不符合“非技术用户批量采集” |

**结论**：目前没有维护良好、许可证清晰、无需 Cookie/抓包、可批量获取公众号历史的开源方案。已有的批量方案要么依赖公众号后台 Cookie/token，要么上游接口已关闭。

## 抖音 / 小红书

| 项目 | 数据/能力 | 技术门槛 | 许可证/维护 | 结论 |
|---|---|---|---|---|
| [NanmiCoder/MediaCrawler](https://github.com/NanmiCoder/MediaCrawler)（68k stars） | 小红书/抖音关键词搜索、详情、评论 | Python + uv + Node + Playwright；扫码登录 | **Non-Commercial Learning License 1.1** | 许可证不允许商业集成；技术门槛高 |
| [persist-1/Visual_MediaCrawler](https://github.com/persist-1/Visual_MediaCrawler)（73 stars） | 同上，带 Web 可视化 | Python/uv/Node，前后端启动 | 继承非商业许可证 | 有 GUI 但仍是开发环境；不可商用集成 |
| [JoeanAmier/TikTokDownloader](https://github.com/JoeanAmier/TikTokDownloader)（17k stars） | 抖音搜索数据、作品数据 | Python/命令行、Cookie | GPL-3.0 | GPL 不适合直接并入本应用；非技术用户不会用 |
| [JoeanAmier/XHS-Downloader](https://github.com/JoeanAmier/XHS-Downloader)（13k stars） | 小红书链接提取/作品采集 | Python/命令行、Cookie | GPL-3.0 | 偏下载，不是关键词批量采集；许可证不适合 |
| [USERSQ1/douying_crawler](https://github.com/USERSQ1/douying_crawler)（14 stars） | 抖音公开数据、桌面 Tkinter/Web、CSV | Python + DrissionPage | MIT | 可给技术同事做外部工具，不适合普通用户 |
| [yangsijie666/xiaohongshu-crawler](https://github.com/yangsijie666/xiaohongshu-crawler)（24 stars） | 小红书关键词搜索、详情、评论、MCP | Python + uv + Playwright，扫码登录 | README 标注 MIT，仓库无 LICENSE 文件 | 技术型工具，可作外部采集器，不集成 |
| [aicu-icu/xhs-mcp-server](https://github.com/aicu-icu/xhs-mcp-server) | 小红书 MCP，基于浏览器插件/油猴 | 安装 Broxy 扩展、导入配置 | 小型项目 | 依赖登录态，技术门槛高，不适合企业用户 |
| 抖音“视频采集”油猴脚本 | 个人主页点赞/收藏列表链接导出 | Tampermonkey，逐页操作 | 个人脚本 | 不是关键词搜索，不能覆盖需求 |

**结论**：功能最全的是 MediaCrawler，但许可证明确限制商业使用，且需要 Python/Playwright/扫码登录。其它项目要么是下载器，要么是技术型脚本。没有可直接打包给市场人员的一键方案。

## 为什么不直接集成这些项目

- **许可证**：MediaCrawler/Visual_MediaCrawler 为非商业学习许可，TikTokDownloader/XHS-Downloader 为 GPL-3.0；直接并入闭源商业试用版有风险。
- **账号与合规**：多数依赖 Cookie、扫码登录、浏览器自动化，容易触发平台风控；不能向用户承诺稳定。
- **维护成本**：平台接口/页面结构一变就失效，已有公众号项目因上游关闭而停止维护。
- **用户体验**：要求用户安装 Python、uv、Node、Playwright、Tampermonkey，和“企业高管/市场人员不会技术”直接冲突。

## 本应用采用的方案

1. **默认零门槛**：复制公众号文章链接、抖音/小红书分享文案 → 市场情报→粘贴添加。不需要登录、Cookie、AppID 或密钥。
2. **公众号公开文章**：支持单篇链接和最多10篇的链接列表；支持上传包含公众号链接的 .txt/.csv 列表。只读取公开文章，遇到验证则提示复制全文。
3. **技术同事可选**：如果企业有技术团队，可用上述外部工具导出 CSV/JSON，再导入本应用；本应用不复制这些项目的代码，也不承担其许可证/平台条款责任。
4. **未来可选**：如需真正一键采集，建议做**签名的浏览器扩展**（用户在浏览器中已登录，点击“保存到观策AI”只采集当前页面）或申请官方开放平台接口。两者都需要单独的安全、隐私、平台授权和发布审核，不能靠现有开源项目直接拼装。

## 参考链接

- wechat-article-exporter：https://github.com/wechat-article/wechat-article-exporter
- wechatDownload：https://github.com/qiye45/wechatDownload
- MediaCrawler：https://github.com/NanmiCoder/MediaCrawler
- Visual_MediaCrawler：https://github.com/persist-1/Visual_MediaCrawler
- TikTokDownloader：https://github.com/JoeanAmier/TikTokDownloader
- XHS-Downloader：https://github.com/JoeanAmier/XHS-Downloader
- xiaohongshu-crawler：https://github.com/yangsijie666/xiaohongshu-crawler

> 本调研只做技术选型参考，不代表上述项目已通过本应用的安全、合规或稳定性验收。
