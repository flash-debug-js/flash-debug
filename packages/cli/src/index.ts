import type { DebugClientAdapter } from '@flash-debug/client'
import process from 'node:process'
import { DEFAULT_DEBUG_PORT } from '@flash-debug/config'
import { startDebugRuntime } from '@flash-debug/core'
import { createAdbAdapter } from '@flash-debug/logger-adb'
import { createHdcAdapter } from '@flash-debug/logger-hdc'
import { cac } from 'cac'
import { createRuntimeConsole } from './runtime-console'

export async function runCli(argv: string[] = process.argv): Promise<void> {
  const cli = cac('flash-debug')
  let actionPromise: Promise<void> | undefined

  cli
    .command('[root]', 'Start the Flash Debug Inspector')
    .option('--env-file <path>', 'Load environment variables from a file, defaults to cwd/.env')
    .option('--port <port>', 'Nitro port', { default: DEFAULT_DEBUG_PORT })
    .option('--host <host>', 'Nitro host', { default: '127.0.0.1' })
    .option('--no-tunnel', 'Start only the local Inspector')
    .option('--mode <mode>', 'Tunnel mode: quick or named', { default: 'quick' })
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
    const client = await resolveClient(options)
    const runtimeConsole = createRuntimeConsole()
    const runtime = await startDebugRuntime({
      host: options.host,
      port: Number(options.port ?? DEFAULT_DEBUG_PORT),
      tunnel: options.tunnel,
      mode: options.mode,
      envFile: options.envFile,
      subdomain: options.subdomain,
      zone: options.zone,
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
  cli.version('0.1.0')
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
