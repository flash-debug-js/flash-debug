# 03 · Client 和适配器

## 统一接口

所有客户端来源都输出 `DebugLogRecord`，并实现：

```ts
interface DebugClientAdapter {
  readonly id: string
  readonly capabilities: readonly string[]

  listDevices: (options?: { signal?: AbortSignal }) => Promise<DebugDevice[]>

  startLogs: (options: {
    deviceId: string
    onRecord: (record: DebugLogRecord) => void
    signal?: AbortSignal
  }) => Promise<DebugClientSession>
}
```

适配器的职责是把平台差异转换成统一的设备和日志事件，不负责上传到公网。上传和页面实时同步由 server/core 处理。

## ADB 日志来源

第一版使用：

```text
adb devices -l
adb -s <serial> logcat -v threadtime
```

设备状态：

- `device` → `online`
- `offline` → `offline`
- `unauthorized` → `unauthorized`
- 其他值 → `unknown`

logcat 解析至少保留：

- 时间戳；
- level；
- tag；
- message；
- deviceId；
- source=`adb`。

ADB 进程由适配器创建和停止。`client` 只能调用 `startLogs` / `stop`，不能直接管理子进程。

## Flutter 日志来源

Flutter 端不是 ADB adapter。Flutter 日志库直接调用：

```text
POST /api/v1/logs/batch
```

服务端把它和 ADB 日志都归一成 `DebugLogRecord`，Inspector 只面向统一事件渲染。

## 后续适配器

- `@flash-debug/logger-ios`：idevicesyslog 或 Xcode 工具链；
- `@flash-debug/logger-flutter`：Flutter VM Service；
- `@flash-debug/logger-http`：接收外部 HTTP 日志；
- `@flash-debug/logger-simulator`：Android/iOS 模拟器日志来源。
