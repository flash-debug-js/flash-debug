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
packages/logger-hdc     # HarmonyOS HDC / HiLog 日志来源
packages/types         # 跨包协议与类型
packages/config        # flash-debug.ts 配置契约
```

`flash-debug` 会启动本地 Nitro 服务，再通过 `@flash-tunnel/sdk` 建立公网 Tunnel。ADB、Flutter 日志和未来的 iOS/模拟器来源都统一转换为 `@flash-debug/types` 中的日志事件。

## 设备日志调试

Android 使用 ADB 适配器：

```bash
flash-debug --no-tunnel --adapter adb --device <device-id>
```

HarmonyOS 使用 HDC 和 HiLog 适配器：

```bash
flash-debug --no-tunnel --adapter hdc --device <device-id>
```

如果 `hdc` 不在 PATH 中，可以传入 DevEco Studio SDK 中的可执行文件路径：

```bash
flash-debug --no-tunnel --adapter hdc --hdc-path "C:/DevEco Studio/sdk/default/HarmonyOS/toolchains/hdc.exe"
```

HDC 设备列表使用 `hdc list targets`，实时日志使用 `hdc -t <device-id> hilog -v long`。每一行 HiLog 会转换成一条完整的 `harmony` 日志事件并上传到本地 Inspector。

适配器会声明自己的采集筛选项，Inspector 会根据声明生成控件。HDC 默认只采集应用日志的 Warning、Error 和 Fatal 级别；可以在页面中继续按日志类型、级别、Domain、Tag、PID 和正则表达式调整。采集筛选变化后会重启当前设备日志会话，已经进入内存的历史日志不会被删除。

## 发布

根目录已经内置 `bumpp`，用于统一更新 monorepo 中公开包的版本号：

```bash
pnpm install
pnpm release
```

`pnpm release` 会执行 `bumpp -r`，交互式更新版本号并创建提交和 Git tag。`bumpp` 默认会将提交和 tag 推送到远程仓库，因此确认版本前请检查当前分支和远程地址：

```bash
git status
git remote -v
```

推送 `v*` tag 后，`.github/workflows/release.yaml` 会执行检查、构建、创建 GitHub Release，并发布可发布的 workspace 包。
