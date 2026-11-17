# 12 · Roadmap

## M0 · 仓库和公共契约

- monorepo workspace；
- `flash-debug` 根入口和 CLI 包；
- `types`、`config`、`client`、`logger-adb` 包骨架；
- `@flash-nexus/sdk` 公共嵌入 API；
- 设计文档和包依赖方向。

## M1 · Nitro Inspector

- Nitro `node_server` 本地服务；
- Vue/Vite Inspector 页面；
- `/healthz`、日志批量接收、历史查询；
- SSE 实时流；
- 会话 token 和本地 JSONL 存储。

## M2 · Flutter 远程日志

- `acewill-flutter-sdk` 新增 remote debug package；
- baseUrl/token 输入和连接；
- 批量上传、重试、离线队列；
- App Logger / SDK Logger sink 接入。

## M3 · ADB

- ADB 检测和设备列表；
- logcat streaming；
- Inspector 中按设备、来源、级别过滤；
- ADB 适配器退出和设备断开恢复。

## M4 · 稳定性

- named Tunnel；
- QR 连接信息；
- 崩溃清理和会话恢复；
- iOS / Flutter VM / HTTP 适配器；
- 包发布和版本兼容策略。
