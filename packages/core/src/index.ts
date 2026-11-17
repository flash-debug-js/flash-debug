import type { DebugClientAdapter, DebugClientSession } from '@flash-debug/client'
import type { DebugFilterValues, DebugSessionSnapshot, DebugSourceDescriptor } from '@flash-debug/types'
import { randomInt } from 'node:crypto'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import process from 'node:process'
import { HttpLogSink } from '@flash-debug/client'
import { startDebugServer } from '@flash-debug/server'
import { startFlashNexus } from '@flash-nexus/sdk'

const require = createRequire(import.meta.url)

export interface DebugRuntimeOptions {
  cwd?: string
  host?: string
  port?: number
  serverRoot?: string
  envFile?: string
  tunnel?: boolean
  mode?: 'quick' | 'named'
  subdomain?: string
  zone?: string
  cloudflaredPath?: string
  client?: {
    adapter: DebugClientAdapter
    deviceId: string
    clientId?: string
    filters?: DebugFilterValues
  }
  onLog?: (line: string, stream: 'stdout' | 'stderr') => void
}

type DebugTunnelSession = Pick<Awaited<ReturnType<typeof startFlashNexus>>, 'localUrl' | 'publicUrl' | 'stop'>

export interface DebugRuntime {
  localUrl: string
  publicUrl?: string
  tunnel?: DebugTunnelSession
  clientSession?: DebugClientSession
  stop: () => Promise<void>
}

const SUBDOMAIN_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789'
const DEFAULT_SUBDOMAIN_TEMPLATE = 'fd-{rand}'

function randomToken(length: number): string {
  return Array.from({ length }, () => SUBDOMAIN_ALPHABET[randomInt(SUBDOMAIN_ALPHABET.length)]).join('')
}

function resolveSubdomain(template = DEFAULT_SUBDOMAIN_TEMPLATE): string {
  const resolved = template.replace(/\{rand(?::(\d+))?\}/g, (_match, length: string | undefined) => randomToken(Number(length ?? 4)))

  if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(resolved)) {
    throw new Error(`Invalid subdomain template "${template}"`)
  }

  return resolved
}

function createHostname(zone: string, subdomain?: string): string {
  return `${resolveSubdomain(subdomain)}.${zone}`
}

function defaultServerRoot(): string {
  const entry = require.resolve('@flash-debug/server')
  return resolve(dirname(entry), '..')
}

/** Start the local Inspector origin and optionally expose it through Tunnel. */
export async function startDebugRuntime(options: DebugRuntimeOptions = {}): Promise<DebugRuntime> {
  const mode = options.mode ?? 'quick'
  const hostname = mode === 'named' && options.zone
    ? createHostname(options.zone, options.subdomain)
    : undefined
  let tunnel: DebugTunnelSession | undefined
  let clientSession: DebugClientSession | undefined
  let logSink: HttpLogSink | undefined
  const sourceDescriptor = options.client?.adapter.getSourceDescriptor?.()
  let clientFilters = mergeDefaultFilters(sourceDescriptor, options.client?.filters)

  const getSessionSnapshot = (): DebugSessionSnapshot => ({
    connected: clientSession !== undefined,
    ...(options.client
      ? {
          adapterId: options.client.adapter.id,
          deviceId: options.client.deviceId,
        }
      : {}),
    ...(sourceDescriptor
      ? { source: sourceDescriptor }
      : {}),
    filters: clientFilters,
  })

  const startClient = async (): Promise<void> => {
    if (!options.client || !logSink) {
      return
    }
    clientSession = await options.client.adapter.startLogs({
      deviceId: options.client.deviceId,
      filters: clientFilters,
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

  const server = await startDebugServer({
    host: options.host,
    port: options.port,
    rootDir: options.serverRoot ?? defaultServerRoot(),
    onControlRequest: async (request) => {
      if (request.action === 'get-session' || !options.client) {
        return getSessionSnapshot()
      }
      await clientSession?.stop()
      clientSession = undefined
      clientFilters = mergeDefaultFilters(sourceDescriptor, request.filters)
      await startClient()
      return getSessionSnapshot()
    },
    onLog: options.onLog,
  })

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
      await startClient()
    }
    if (options.tunnel !== false) {
      tunnel = await startFlashNexus({
        localUrl: server.localUrl,
        cwd: options.cwd ?? process.cwd(),
        envFile: options.envFile,
        config: {
          server: { url: server.localUrl },
          tunnel: {
            mode,
            hostname,
            cloudflaredPath: options.cloudflaredPath,
          },
          ...(mode === 'named'
            ? {
                dns: {
                  zone: options.zone,
                  hostname,
                },
              }
            : {}),
        },
        mode,
        hostname,
        zone: options.zone,
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

function mergeDefaultFilters(
  descriptor: DebugSourceDescriptor | undefined,
  values: DebugFilterValues | undefined,
): DebugFilterValues {
  const defaults = Object.fromEntries(
    (descriptor?.filters ?? [])
      .filter(filter => filter.defaultValue !== undefined)
      .map(filter => [
        filter.id,
        Array.isArray(filter.defaultValue)
          ? [...filter.defaultValue]
          : filter.defaultValue,
      ]),
  )
  return {
    ...defaults,
    ...values,
  }
}
