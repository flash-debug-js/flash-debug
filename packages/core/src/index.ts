import type { DebugClientAdapter, DebugClientSession } from '@flash-debug/client'
import type { EmbeddedTunnelSession } from '@flash-tunnel/sdk'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import process from 'node:process'
import { HttpLogSink } from '@flash-debug/client'
import { startDebugServer } from '@flash-debug/server'
import { startTunnel } from '@flash-tunnel/sdk'

const require = createRequire(import.meta.url)

export interface DebugRuntimeOptions {
  cwd?: string
  host?: string
  port?: number
  serverRoot?: string
  tunnel?: boolean
  mode?: 'quick' | 'named'
  hostname?: string
  zone?: string
  cloudflaredPath?: string
  apiToken?: string
  accountId?: string
  zoneId?: string
  client?: {
    adapter: DebugClientAdapter
    deviceId: string
    clientId?: string
  }
  onLog?: (line: string, stream: 'stdout' | 'stderr') => void
}

export interface DebugRuntime {
  localUrl: string
  publicUrl?: string
  tunnel?: EmbeddedTunnelSession
  clientSession?: DebugClientSession
  stop: () => Promise<void>
}

function defaultServerRoot(): string {
  const entry = require.resolve('@flash-debug/server')
  return resolve(dirname(entry), '..')
}

/** Start the local Inspector origin and optionally expose it through Tunnel. */
export async function startDebugRuntime(options: DebugRuntimeOptions = {}): Promise<DebugRuntime> {
  const server = await startDebugServer({
    host: options.host,
    port: options.port,
    rootDir: options.serverRoot ?? defaultServerRoot(),
    onLog: options.onLog,
  })

  let tunnel: EmbeddedTunnelSession | undefined
  let clientSession: DebugClientSession | undefined
  let logSink: HttpLogSink | undefined
  try {
    if (options.client) {
      const clientId = options.client.clientId
        ?? `flash-debug-${options.client.adapter.id}-${options.client.deviceId}`
      logSink = new HttpLogSink({
        baseUrl: server.localUrl,
        clientId,
        onError: error => options.onLog?.(
          error instanceof Error
            ? error.message
            : String(error),
          'stderr',
        ),
      })
      clientSession = await options.client.adapter.startLogs({
        deviceId: options.client.deviceId,
        onRecord: (record) => {
          try {
            logSink?.append(record)
          }
          catch (error) {
            options.onLog?.(
              error instanceof Error
                ? error.message
                : String(error),
              'stderr',
            )
          }
        },
      })
    }
    if (options.tunnel !== false) {
      tunnel = await startTunnel({
        localUrl: server.localUrl,
        cwd: options.cwd ?? process.cwd(),
        mode: options.mode ?? 'quick',
        hostname: options.hostname,
        zone: options.zone,
        cloudflaredPath: options.cloudflaredPath,
        apiToken: options.apiToken,
        accountId: options.accountId,
        zoneId: options.zoneId,
        onLog: options.onLog,
      })
    }
  }
  catch (error) {
    await clientSession?.stop()
    await logSink?.close().catch(() => {})
    await server.close()
    throw error
  }

  let stopped = false
  return {
    localUrl: server.localUrl,
    publicUrl: tunnel?.publicUrl,
    tunnel,
    clientSession,
    stop: async () => {
      if (stopped) {
        return
      }
      stopped = true
      await clientSession?.stop()
      await logSink?.close()
      await tunnel?.stop()
      await server.close()
    },
  }
}
