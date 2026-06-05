# 流量哨兵

Windows 网络流量监控工具 MVP。首版使用 Tauri + Rust + React/TypeScript + SQLite，默认低权限、无驱动运行。

## 当前能力

- 每秒采样网卡累计收发字节，计算实时上传/下载速度。
- 本地 SQLite 保存短周期样本、应用估算样本和告警。
- 使用 Windows IP Helper API 枚举 TCP/UDP 连接与 PID。
- 对远端 IP 标记中国大陆、港澳台、境外、内网、未知。
- 主窗口包含总览、实时监控、统计、应用排行、境外监控、规则与告警、设置。
- 托盘常驻、最小化到后台、独立悬浮小组件窗口。

## 开发

```powershell
npm install
npm run dev
npm run tauri dev
```

Rust 工具链是 Tauri 原生构建的必需项。仅运行 `npm run dev` 时会打开浏览器版前端，并使用内置 mock 数据。
