# 依赖修复记录

2026-10-26：原锁文件审计 11 项（含2项 critical）。更新 Vite 8.3.5、Vitest 5.0.5、React 插件6.1.2、React Router7.18.4；保留Tailwind3，在覆盖层固定已修复的postcss-selector-parser7.1.6。

验证：npm audit → 0 vulnerabilities；24项业务测试通过，类型检查、lint和生产构建通过。页面样式与交互继续纳入后续Electron验收。
