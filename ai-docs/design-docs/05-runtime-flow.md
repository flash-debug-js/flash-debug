# 05 · 运行时流程

## 启动

```text
flash-debug
  ├─ 1. 解析 flash-debug.ts / CLI 参数
  ├─ 2. 启动 Nitro server，得到 localUrl
  ├─ 3. 注册 client adapters
  ├─ 4. 调用 @flash-tunnel/sdk.startTunnel({ localUrl })
  ├─ 5. 等待 publicUrl
  ├─ 6. 输出 URL / 打开 Inspector / 可选生成二维码
  └─ 7. 等待 Ctrl+C、Tunnel 退出或自动停止
```

## 关闭

关闭顺序固定为：

```text
停止接受新日志
  ↓
停止 ADB / 其他 client sessions
  ↓
停止 @flash-tunnel/sdk session
  ↓
关闭 Nitro server
  ↓
flush 本地日志并退出
```

`flash-debug` 负责安装进程信号处理。`@flash-tunnel/sdk` 不应自行安装 CLI 风格的全局 SIGINT 处理器，以免和宿主程序冲突。

## Tunnel 模式

- `quick`：第一版默认，无需 Cloudflare API Token；
- `named`：稳定域名，需要 API Token、账号和 Zone；
- `flash-debug` 对用户暴露自己的配置，不要求用户了解 flash-tunnel 的 CLI 参数。

## 本地服务

Inspector 页面、日志 API、SSE 和健康检查必须由同一个 Nitro origin 提供。Tunnel 只代理这个 origin，不代理多个端口。
