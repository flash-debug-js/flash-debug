# flash-debug 设计文档

`flash-debug` 是一个本地运行的移动端远程调试工具。它启动本地 Nitro 服务，托管 Inspector 页面和调试 API，再通过 `@flash-nexus/sdk` 将这个单一 origin 暴露到公网，并按配置处理 Tunnel 与 DNS。

## 文档索引

| 文档 | 内容 |
| --- | --- |
| [01-architecture.md](./01-architecture.md) | 总体架构、运行时边界和生命周期 |
| [02-package-structure.md](./02-package-structure.md) | monorepo 包职责和依赖方向 |
| [03-client-adapters.md](./03-client-adapters.md) | client 抽象、ADB 适配器和未来扩展 |
| [04-log-protocol.md](./04-log-protocol.md) | 日志事件、上传和实时推送协议 |
| [05-runtime-flow.md](./05-runtime-flow.md) | `npx flash-debug` 启动时序和清理规则 |
| [06-inspector-design.md](./06-inspector-design.md) | Inspector 页面信息架构、布局、状态和交互 |
| [07-silkworm-design.md](./07-silkworm-design.md) | Silkworm 测试客户端、自动场景和手动发送设计 |
| [12-roadmap.md](./12-roadmap.md) | 分阶段实现计划 |

## 核心决策

1. 根包 `flash-debug` 是统一出口，同时提供 npm `bin` 和配置导出。
2. `@flash-debug/cli` 只处理命令行；业务编排放在 `@flash-debug/core`。
3. `@flash-debug/server` 使用 Nitro，页面名称为 Inspector。
4. `@flash-debug/client` 只定义客户端来源的统一生命周期，不知道 ADB 细节。
5. `@flash-debug/logger-adb` 实现 Android ADB/logcat 日志接入。
6. `@flash-nexus/sdk` 负责将本地 origin 暴露到公网，并协调 Tunnel 与 DNS；它不负责调试业务。
7. Flutter 日志库继续放在 `acewill-flutter-sdk`，通过统一日志协议接入服务。
