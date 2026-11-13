# 01 · 总体架构

## 定位

一次 `flash-debug` 运行包含三个本地部分：

```text
flash-debug CLI
  ├─ @flash-debug/server      Nitro API + Inspector 页面
  ├─ @flash-debug/client      客户端来源编排
  │    └─ @flash-debug/logger-adb
  └─ @flash-tunnel/sdk        Cloudflare Tunnel 生命周期
```

公网链路只有一个 origin：

```text
Flutter App ──HTTPS──┐
                     ├── Cloudflare Tunnel ──> Nitro :4517
Browser Inspector ──┘                         ├── /
                                               ├── /api/v1/logs
                                               ├── /api/v1/stream
                                               └── /healthz
```

页面、日志 API、SSE 流必须使用同一个 origin。这样移动端只需配置一个 `baseUrl`，浏览器也不需要跨域请求。

## 组件边界

### `@flash-debug/server`

负责 HTTP 层和页面宿主：

- Nitro route handlers；
- Inspector 静态资源；
- 日志接收、查询和 SSE；
- 会话 token 验证；
- 本地日志存储和内存 ring buffer。

它不负责启动 Tunnel，也不负责调用 ADB。

### `@flash-debug/client`

负责客户端来源的统一抽象：

- 注册适配器；
- 枚举设备；
- 启动和停止客户端日志会话；
- 将来源日志转换成统一事件；
- 将事件交给 server/core 的 sink。

它不依赖具体的 ADB 命令。

### `@flash-debug/logger-adb`

只负责 Android 平台：

- 找到 `adb`；
- 执行 `adb devices -l`；
- 启动 `adb logcat`；
- 解析 logcat 行；
- 将进程退出转换为客户端会话状态。

未来的 iOS、Flutter VM、模拟器日志来源都实现同一个 logger contract。

### `@flash-tunnel/sdk`

负责：

- 接收已启动的本地 origin；
- 创建 quick/named Tunnel；
- 返回公网 URL；
- 停止 cloudflared；
- 清理本次会话创建的 Cloudflare 资源。

它不应该知道 Inspector、日志协议或设备类型。
