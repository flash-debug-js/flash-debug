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

## 查询和实时流

```text
GET /api/v1/logs?cursor=<cursor>
GET /api/v1/stream
```

Inspector 首先请求历史日志，再连接 SSE。SSE 使用 `id:` 字段和 `Last-Event-ID` 支持断线恢复，并发送 heartbeat 防止长连接空闲。

## 安全和容量

- token 按 Debug 会话生成并过期；
- ingest token 和 viewer cookie 分离；
- 不把 token 放在 URL 查询参数；
- 单批次和单条消息限制大小；
- 服务端和 Flutter 端都做脱敏；
- 远程上传失败不能再次进入远程日志 sink；
- 默认只保留有限数量的内存日志和 JSONL 文件大小。
