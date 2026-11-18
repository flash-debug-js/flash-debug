import type { DebugClientAdapter } from '@flash-debug/client'
import process from 'node:process'
import { loadFlashDebugConfig, resolveFlashDebugOptions } from '@flash-debug/config'
import { startDebugRuntime } from '@flash-debug/core'
import { createAdbAdapter } from '@flash-debug/logger-adb'
import { createHdcAdapter } from '@flash-debug/logger-hdc'
import { cac } from 'cac'
import { createRuntimeConsole } from './runtime-console'
import { FLASH_DEBUG_CLI_VERSION } from './version'

export async function runCli(argv: string[] = process.argv): Promise<void> {
  const cli = cac('flash-debug')
  let actionPromise: Promise<void> | undefined

  cli
    .command('[root]', 'Start the Flash Debug Inspector')
    .option('--env-file <path>', 'Load environment variables from a file, defaults to cwd/.env')
    .option('--port <port>', 'Nitro port')
    .option('--host <host>', 'Nitro host')
    .option('--no-tunnel', 'Start only the local Inspector')
    .option('--mode <mode>', 'Tunnel mode: quick or named')
    .option('--subdomain <pattern>', 'Named tunnel subdomain template such as fd-{rand:4}')
    .option('--zone <zone>', 'Cloudflare DNS zone')
    .option('--adapter <adapter>', 'Log adapter: adb or hdc')
    .option('--device <deviceId>', 'Device ID for the selected adapter')
    .option('--adb-path <path>', 'Path to adb executable')
    .option('--hdc-path <path>', 'Path to hdc executable')
    .action((_root: unknown, options: {
      envFile?: string
      port?: number | string
      host?: string
      tunnel?: boolean
      mode?: 'quick' | 'named'
      subdomain?: string
      zone?: string
      adapter?: string
      device?: string
      adbPath?: string
      hdcPath?: string
    }) => {
      actionPromise = start(options)
      return actionPromise
    })

  async function start(options: {
    envFile?: string
    port?: number | string
    host?: string
    tunnel?: boolean
    mode?: 'quick' | 'named'
    subdomain?: string
    zone?: string
    adapter?: string
    device?: string
    adbPath?: string
    hdcPath?: string
  }): Promise<void> {
    const loaded = await loadFlashDebugConfig({
      cwd: process.cwd(),
      envFile: options.envFile,
    })
    const config = loaded.config
    const resolvedOptions = resolveFlashDebugOptions({
      config,
      cli: options,
    })
    const client = await resolveClient({
      ...options,
      adapter: options.adapter ?? config.clients?.adapter,
      device: options.device ?? config.clients?.device,
      adbPath: options.adbPath ?? config.clients?.adbPath,
      hdcPath: options.hdcPath ?? config.clients?.hdcPath,
    })
    const runtimeConsole = createRuntimeConsole()
    const runtime = await startDebugRuntime({
      host: resolvedOptions.host,
      port: resolvedOptions.port,
      tunnel: resolvedOptions.tunnel,
      mode: resolvedOptions.mode,
      envFile: options.envFile,
      subdomain: resolvedOptions.subdomain,
      zone: resolvedOptions.zone,
      cloudflaredPath: resolvedOptions.cloudflaredPath,
      client,
      onLog: runtimeConsole.writeLog,
    })

    process.stdout.write(`Inspector  ${runtime.localUrl}\n`)
    if (runtime.clientSession) {
      process.stdout.write(`Client     ${runtime.clientSession.device.transport} ${runtime.clientSession.device.id}\n`)
    }
    if (runtime.publicUrl) {
      process.stdout.write(`Public     ${runtime.publicUrl}\n`)
    }

    await runtimeConsole.run(runtime)
  }

  cli.help()
  cli.version(FLASH_DEBUG_CLI_VERSION)
  cli.parse(argv)
  await actionPromise
}

async function resolveClient(options: {
  adapter?: string
  device?: string
  adbPath?: string
  hdcPath?: string
}): Promise<{
  adapter: DebugClientAdapter
  deviceId: string
} | undefined> {
  if (!options.adapter) {
    return undefined
  }

  const adapter = createAdapter(options)
  const devices = await adapter.listDevices()
  if (devices.length === 0) {
    throw new Error(`No ${options.adapter} devices found`)
  }

  const selected = options.device
    ? devices.find(device => device.id === options.device)
    : devices.length === 1
      ? devices[0]
      : undefined
  if (!selected) {
    const deviceList = devices.map(device => `${device.id} (${device.state})`).join(', ')
    throw new Error(`Multiple ${options.adapter} devices found. Use --device <deviceId>: ${deviceList}`)
  }

  return {
    adapter,
    deviceId: selected.id,
  }
}

function createAdapter(options: {
  adapter?: string
  adbPath?: string
  hdcPath?: string
}): DebugClientAdapter {
  switch (options.adapter) {
    case 'adb':
      return createAdbAdapter({ adbPath: options.adbPath })
    case 'hdc':
      return createHdcAdapter({ hdcPath: options.hdcPath })
    default:
      throw new Error(`Unknown adapter "${options.adapter}". Expected adb or hdc`)
  }
}
