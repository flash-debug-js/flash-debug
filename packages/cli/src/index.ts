import process from 'node:process'
import { DEFAULT_DEBUG_PORT } from '@flash-debug/config'
import { startDebugRuntime } from '@flash-debug/core'
import { cac } from 'cac'

export async function runCli(argv: string[] = process.argv): Promise<void> {
  const cli = cac('flash-debug')
  let actionPromise: Promise<void> | undefined

  cli
    .command('[root]', 'Start the Flash Debug Inspector')
    .option('--port <port>', 'Nitro port', { default: DEFAULT_DEBUG_PORT })
    .option('--host <host>', 'Nitro host', { default: '127.0.0.1' })
    .option('--no-tunnel', 'Start only the local Inspector')
    .option('--mode <mode>', 'Tunnel mode: quick or named', { default: 'quick' })
    .option('--hostname <hostname>', 'Named tunnel hostname')
    .option('--zone <zone>', 'Cloudflare DNS zone')
    .action((_root: unknown, options: {
      port?: number | string
      host?: string
      tunnel?: boolean
      mode?: 'quick' | 'named'
      hostname?: string
      zone?: string
    }) => {
      actionPromise = start(options)
      return actionPromise
    })

  async function start(options: {
    port?: number | string
    host?: string
    tunnel?: boolean
    mode?: 'quick' | 'named'
    hostname?: string
    zone?: string
  }): Promise<void> {
    const runtime = await startDebugRuntime({
      host: options.host,
      port: Number(options.port ?? DEFAULT_DEBUG_PORT),
      tunnel: options.tunnel,
      mode: options.mode,
      hostname: options.hostname,
      zone: options.zone,
      onLog: (line, stream) => {
        process.stderr.write(`[${stream}] ${line}\n`)
      },
    })

    process.stdout.write(`Inspector  ${runtime.localUrl}\n`)
    if (runtime.publicUrl) {
      process.stdout.write(`Public     ${runtime.publicUrl}\n`)
    }

    const stop = async () => {
      await runtime.stop()
      process.exitCode = 0
    }
    process.once('SIGINT', () => {
      void stop()
    })
    process.once('SIGTERM', () => {
      void stop()
    })
    await new Promise<void>(() => {})
  }

  cli.help()
  cli.version('0.1.0')
  cli.parse(argv)
  await actionPromise
}
