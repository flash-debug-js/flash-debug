# 07 · Silkworm 测试客户端设计

## 定位

Silkworm 是 `flash-debug` 专用的本地测试客户端。它像一只不断吐丝的小蚕，持续生成完整的 JSON 日志事件并发送到指定的 Flash Debug 服务，用来验证：

- Flutter 日志接收 API；
- ADB/其他来源产生的统一事件；
- 批量上传、去重和错误处理；
- Inspector 的列表、筛选和详情查看；
- 不同日志类型和不同内容格式的展示。

Silkworm 不是生产日志库，也不负责接入真实设备。它提供一个本地 Web 工作台，通过 `dev:silkworm` 启动。

## 启动方式

根目录增加脚本：

```json
{
  "scripts": {
    "dev:silkworm": "pnpm --filter @flash-debug/silkworm dev"
  }
}
```

开发者执行：

```bash
pnpm dev:silkworm
```

浏览器打开本地 Silkworm 工作台。Silkworm 的目标服务地址、token、clientId 和 deviceId 都在界面中配置，不写入仓库文件。

推荐包名和目录：

```text
packages/silkworm
@flash-debug/silkworm
```

第一版可以保持为 workspace 私有应用，协议稳定后再作为公共 npm 包发布。

## 运行边界

Silkworm 的 Web UI 不直接把 token 和日志请求发到公网目标。推荐采用本地控制服务代理：

```text
Silkworm Inspector UI
        │ same-origin control API
        ▼
Silkworm Runner
        │ HTTPS POST /api/v1/logs/batch
        ▼
Flash Debug Nitro Server
```

这样可以：

- 避免目标服务必须开放 CORS；
- 保持自动模式和手动模式使用同一个发送队列；
- 在本地控制服务中统一处理重试、批量和统计；
- 让浏览器页面只负责控制，不负责传输细节。

Silkworm 发送的每条日志都是完整事件。它不模拟 AI 内容流，也不把一条日志拆成增量 chunk。自动模式的“持续发送”只表示不断产生多条完整日志。

## 页面布局

```text
┌──────────────────────────────────────────────────────────────┐
│ Silkworm        Target: http://127.0.0.1:4517    Connected  │
│ [Connect] [Test request] [Clear history]                    │
├──────────────────────────────┬───────────────────────────────┤
│ AUTO MODE                    │ MANUAL SEND                   │
│                              │                               │
│ Scenario                     │ Event type                    │
│ Rate / batch / duration      │ Level / source / device       │
│ Seed                         │ Content format                │
│ [Start] [Pause] [Stop]       │ JSON/YAML/Text editor         │
│                              │ [Send once] [Send batch]      │
├──────────────────────────────┴───────────────────────────────┤
│ RUN STATUS                                                     │
│ sent 124   accepted 124   failed 0   duplicate 3   queue 0  │
├──────────────────────────────────────────────────────────────┤
│ SEND HISTORY                                                   │
│ time       mode      type       status       summary          │
└──────────────────────────────────────────────────────────────┘
```

自动模式和手动模式同时存在于同一个页面，但状态相互独立：自动模式可以持续发送，用户仍然可以手动发送一条异常事件。

## 共享连接区

页面顶部是两个模式共用的连接设置：

- Target Base URL：例如 `https://xxx.trycloudflare.com`；
- ingest token；
- clientId；
- deviceId；
- 默认 source；
- Connect / Disconnect；
- Test request。

连接成功后显示：

```text
Connected · HTTPS · last response 200 · 12ms
```

连接失败不阻止用户编辑和准备数据。发送动作会进入失败记录，并显示可以重试的原因。

## Auto Mode

自动模式用于模拟持续运行的客户端。它需要支持：

### 基础控制

- scenario；
- events per second；
- batch size；
- duration；
- seed；
- clientId；
- deviceId；
- Start / Pause / Stop；
- 是否在 error 事件时立即 flush。

### 场景预设

第一版预设：

| 场景 | 行为 |
| --- | --- |
| `normal` | 按比例生成 debug、info、warning、error |
| `mixed-sources` | Flutter、ADB、Server 来源混合 |
| `content-formats` | JSON、JSONL、YAML、ANSI、纯文本 |
| `network` | 生成请求、响应、状态码、耗时和错误 |
| `exceptions` | 生成 error、stackTrace 和 metadata |
| `burst` | 短时间高频批量发送 |
| `duplicates` | 重复 eventId，验证服务端幂等 |
| `invalid` | 缺字段、错误类型和过大内容，验证错误响应 |
| `multi-device` | 多个 deviceId 轮换发送 |
| `long-run` | 低频持续运行，验证内存和连接稳定性 |

每个场景都使用确定性 seed。相同 seed、速率和配置应该产生可复现的事件序列。

### 自动模式状态

```text
idle → starting → running → paused
                     ├──→ stopped
                     ├──→ completed
                     └──→ failed
```

暂停只暂停生成和发送，不清空已经生成的历史。恢复后继续使用同一个 runId 和 sequence。

## Manual Send

手动模式用于精确构造一条事件或一批事件。表单字段：

- eventId；
- timestamp；
- level；
- type；
- source；
- tag；
- clientId；
- deviceId；
- contentFormat；
- summary/message；
- content；
- error；
- stackTrace；
- metadata JSON。

内容编辑器是可编辑的测试输入区，可以提供 JSON 格式化和校验，但它和 Inspector 的详情编辑器不同：

- Silkworm 手动编辑器可写；
- Inspector 日志详情编辑器只读。

按钮：

- Send once：发送一条完整事件；
- Send batch：把当前事件复制成 N 条并发送；
- Duplicate ID：复用相同 eventId 测试幂等；
- Reset：恢复默认事件；
- Preview payload：查看最终发送 JSON。

## 发送队列和统计

自动模式和手动模式共享本地 Runner，但保留各自的 mode 标记。每次发送都产生一条 `SendAttempt`：

```ts
interface SendAttempt {
  id: string
  mode: 'auto' | 'manual'
  eventIds: string[]
  startedAt: string
  finishedAt?: string
  status: 'queued' | 'sent' | 'accepted' | 'failed' | 'duplicate'
  statusCode?: number
  error?: string
}
```

顶部统计至少包含：

- generated；
- queued；
- accepted；
- failed；
- duplicate；
- retrying；
- current queue length。

发送历史只保留最近 500 条，避免 Silkworm 自己成为高内存测试对象。

## 发送协议

两种模式最终都调用同一个服务端接口：

```text
POST /api/v1/logs/batch
Authorization: Bearer <ingest-token>
Content-Type: application/json
```

请求体：

```json
{
  "clientId": "silkworm-01",
  "items": [
    {
      "id": "silkworm-01-42",
      "timestamp": "2026-11-13T12:00:00.000Z",
      "level": "error",
      "type": "exception",
      "source": "flutter",
      "deviceId": "pixel-8",
      "message": "request failed",
      "contentFormat": "text",
      "content": "TimeoutException ..."
    }
  ]
}
```

Silkworm 不调用 Inspector 的 SSE 接口。它只负责发送数据；Inspector 通过 SSE 观察发送结果是否正确到达。

## 失败和边界测试

自动模式和手动模式都应该能够制造这些结果：

- 目标服务离线；
- token 错误；
- 连接超时；
- 429 限流；
- 500 服务端错误；
- 单条内容过大；
- 批次过大；
- 重复 eventId；
- 时间戳倒序；
- 未知 source/type；
- JSON 内容声明为 YAML；
- 非法 JSON；
- ANSI 内容；
- 空 message；
- 缺失 deviceId。

失败测试默认不阻塞整个 UI。每次失败都显示在 Send History 中，自动模式按照重试策略继续或停止。

## 安全边界

Silkworm 只是开发测试工具：

- 不默认保存 token；
- 不把 token 写入 Send History；
- 不把 token 放进错误消息；
- 发送预览时脱敏 Authorization；
- 允许用户显式开启高频和大 payload；
- 页面显示当前目标地址，避免误发到生产环境。

## 包和目录建议

```text
packages/silkworm/
├── src/
│   ├── runner/             # 自动/手动发送队列
│   ├── scenarios/          # 场景生成器
│   ├── transport/          # batch POST、重试、统计
│   └── ui/                 # Silkworm Web UI
├── nitro.config.ts         # 本地控制 API
└── package.json
```

Silkworm 可以复用 `@flash-debug/types` 的事件定义，但不依赖 Inspector UI，也不依赖 ADB logger。它应该能够在没有 Android 设备和没有 Flutter App 的情况下独立运行。

## 第一版验收

第一版完成的判断标准：

1. `pnpm dev:silkworm` 能打开 Silkworm 页面；
2. 目标地址和 token 可在页面中设置；
3. Auto Mode 可以按场景、速率和批次持续发送；
4. Manual Send 可以编辑 JSON/YAML/文本并发送；
5. 两个模式可以同时运行；
6. 发送结果和失败原因可在同一页面查看；
7. Inspector 能实时显示 Silkworm 发出的完整事件；
8. duplicate、invalid、burst 和 long-run 场景至少各有一个可复现配置。
