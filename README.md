# flash-debug

本地运行的移动端远程调试工具。

仓库采用和 `flash-tunnel` 类似的 monorepo 结构：

```text
packages/flash-debug   # 公开入口、配置导出、npx flash-debug
packages/cli           # 命令行层
packages/core          # 调试会话编排
packages/server        # Nitro API 与 Inspector 页面宿主
packages/inspector     # Vue/Vite Inspector 前端页面
packages/client        # 通用客户端和适配器注册
packages/logger-adb     # Android ADB / logcat 日志来源
packages/types         # 跨包协议与类型
packages/config        # flash-debug.ts 配置契约
```

`flash-debug` 会启动本地 Nitro 服务，再通过 `@flash-tunnel/sdk` 建立公网 Tunnel。ADB、Flutter 日志和未来的 iOS/模拟器来源都统一转换为 `@flash-debug/types` 中的日志事件。
