# 02 · 包结构和依赖方向

```text
packages/
├── flash-debug/       # 公开入口：bin + config export
├── cli/               # @flash-debug/cli
├── core/              # @flash-debug/core
├── server/            # @flash-debug/server
├── inspector/         # @flash-debug/inspector
├── client/            # @flash-debug/client
├── logger-adb/        # @flash-debug/logger-adb
├── types/             # @flash-debug/types
└── config/            # @flash-debug/config
```

依赖方向：

```text
types ◄── config
  ▲       ▲
  │       └── flash-debug
  ├── client ◄── logger-adb
  ├── server
  └── core ──> @flash-nexus/sdk
                  ▲
cli ───────────────┘
```

更准确的运行依赖是：

```text
flash-debug
  └── @flash-debug/cli
        └── @flash-debug/core
              ├── @flash-debug/server
              ├── @flash-debug/client
              └── @flash-nexus/sdk
```

约束：

- `types` 不依赖任何业务包。
- `logger-adb` 只依赖 `types`，不依赖 `core` 或 `server`。
- `client` 不导入具体日志来源实现，只接收 logger 实例。
- `server` 不启动客户端进程。
- `cli` 不直接操作 Nitro、ADB 或 Tunnel 细节。
- `flash-debug` 根包只做用户入口和配置导出。
- Flutter/Dart 包不放进这个 TypeScript workspace，继续维护在 `acewill-flutter-sdk`。

## 发布边界

第一阶段的公共 npm 包：

- `flash-debug`
- `@flash-debug/client`
- `@flash-debug/logger-adb`
- `@flash-debug/types`

`@flash-debug/core`、`@flash-debug/server`、`@flash-debug/config` 可以先作为内部 workspace 包，等 API 稳定后再决定是否公开发布。
