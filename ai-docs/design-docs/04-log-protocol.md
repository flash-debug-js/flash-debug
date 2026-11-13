# 04 · 日志协议

## 事件

```ts
interface DebugLogRecord {
  id: string
  timestamp: string
  level: 'debug' | 'info' | 'warning' | 'error'
  message: string
  source: 'flutter' | 'adb' | 'server' | 'unknown'
  tag?: string
  deviceId?: string
  sessionId?: string
  error?: string
  stackTrace?: string
  attributes?: Record<string, unknown>
}
```

`id` 用于幂等去重。Flutter 端应使用本地 `bootId + sequence` 生成稳定 ID，ADB 端由 adapter 生成来源 ID。

每条日志都是一条完整、不可变的 JSON 事件。当前协议不把日志正文拆成 `chunk`、`delta` 或 `streamId`，也不做 AI 消息那种内容增量拼接。ADB 的一行 logcat、Flutter Logger 的一条记录和服务端的一条诊断事件，都各自对应一条完整记录。

## 接收

```text
POST /api/v1/logs/batch
Authorization: Bearer <ingest-token>
Content-Type: application/json
```

请求体：

```json
{
  "clientId": "android-abc",
  "items": [
    {
      "id": "boot-1-42",
      "timestamp": "2026-11-13T10:00:00.000Z",
      "level": "error",
      "source": "flutter",
      "tag": "AI_API",
      "message": "request failed"
    }
  ]
}
```

响应返回已接受的最后序号或 ID。重复事件返回成功但不重复写入。

## 查询和实时传输

```text
GET /api/v1/logs?cursor=<cursor>
GET /api/v1/stream
```

Inspector 首先请求历史日志，再连接 SSE。这里的“流”只描述传输连接：SSE 每次推送一条完整日志事件，不改变日志正文的完整性。SSE 使用 `id:` 字段和 `Last-Event-ID` 支持断线恢复，并发送 heartbeat 防止长连接空闲。

Flutter 可以通过 `/api/v1/logs/batch` 批量发送多条完整记录，但批量只是传输优化，不改变单条记录的边界。ADB 适配器持续读取 logcat 时，也应把每个完整日志行转换成一条独立事件。

## 内容格式

`content` 保存日志正文，`contentFormat` 是可选的展示提示：

```ts
type DebugContentFormat = 'json' | 'jsonc' | 'jsonl' | 'yaml' | 'ansi' | 'text'
```

Inspector 的详情查看器按以下优先级决定语言：客户端显式提示、MIME 或文件名、解析检测、最后回退到 `text`。纯文本不做语法高亮；JSON、YAML 和 ANSI 只在详情弹窗中高亮，不在日志列表中渲染。

## 安全和容量

- token 按 Debug 会话生成并过期；
- ingest token 和 viewer cookie 分离；
- 不把 token 放在 URL 查询参数；
- 单批次和单条消息限制大小；
- 服务端和 Flutter 端都做脱敏；
- 远程上传失败不能再次进入远程日志 sink；
- 默认只保留有限数量的内存日志和 JSONL 文件大小。
