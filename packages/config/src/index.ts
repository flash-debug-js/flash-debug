import { createRequire } from 'node:module'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { resolveFlashNexusEnvironment } from '@flash-nexus/config/environment'
import { loadConfig } from 'c12'
import { createJiti } from 'jiti'
import { DEFAULT_DEBUG_PORT } from './constants'

export { DEFAULT_DEBUG_PORT } from './constants'

export interface FlashDebugConfig {
  server?: {
    host?: string
    port?: number
  }
  tunnel?: {
    mode?: 'quick' | 'named'
    subdomain?: string
    zone?: string
    cloudflaredPath?: string
  }
  clients?: {
    adapter?: string
    device?: string
    adbPath?: string
    hdcPath?: string
  }
}

export function defineConfig<T extends FlashDebugConfig>(config: T): T {
  return config
}

function assertObject(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${path} must be an object`)
  }
  return value as Record<string, unknown>
}

function assertKnownFields(value: Record<string, unknown>, fields: readonly string[], path: string): void {
  for (const key of Object.keys(value)) {
    if (!fields.includes(key)) {
      throw new TypeError(`Unknown configuration field: ${path}.${key}`)
    }
  }
}

function assertOptionalString(value: unknown, path: string): void {
  if (value !== undefined && typeof value !== 'string') {
    throw new TypeError(`${path} must be a string`)
  }
}

export function validateFlashDebugConfig(config: unknown): asserts config is FlashDebugConfig {
  const root = assertObject(config, 'config')
  assertKnownFields(root, ['server', 'tunnel', 'clients'], 'config')

  if (root.server !== undefined) {
    const server = assertObject(root.server, 'config.server')
    assertKnownFields(server, ['host', 'port'], 'config.server')
    assertOptionalString(server.host, 'config.server.host')
    if (server.port !== undefined && (!Number.isInteger(server.port) || Number(server.port) < 1 || Number(server.port) > 65535)) {
      throw new TypeError('config.server.port must be an integer between 1 and 65535')
    }
  }

  if (root.tunnel !== undefined) {
    const tunnel = assertObject(root.tunnel, 'config.tunnel')
    assertKnownFields(tunnel, [
      'mode',
      'subdomain',
      'zone',
      'cloudflaredPath',
    ], 'config.tunnel')
    if (tunnel.mode !== undefined && tunnel.mode !== 'quick' && tunnel.mode !== 'named') {
      throw new TypeError('config.tunnel.mode must be quick or named')
    }
    assertOptionalString(tunnel.subdomain, 'config.tunnel.subdomain')
    assertOptionalString(tunnel.zone, 'config.tunnel.zone')
    assertOptionalString(tunnel.cloudflaredPath, 'config.tunnel.cloudflaredPath')
  }

  if (root.clients !== undefined) {
    const clients = assertObject(root.clients, 'config.clients')
    assertKnownFields(clients, [
      'adapter',
      'device',
      'adbPath',
      'hdcPath',
    ], 'config.clients')
    assertOptionalString(clients.adapter, 'config.clients.adapter')
    assertOptionalString(clients.device, 'config.clients.device')
    assertOptionalString(clients.adbPath, 'config.clients.adbPath')
    assertOptionalString(clients.hdcPath, 'config.clients.hdcPath')
  }
}

export interface FlashDebugCliOptions {
  host?: string
  port?: number | string
  tunnel?: boolean
  mode?: FlashDebugConfig['tunnel'] extends infer T
    ? T extends { mode?: infer M } ? M : never
    : never
  subdomain?: string
  zone?: string
}

export interface ResolvedFlashDebugOptions {
  host: string
  port: number
  tunnel: boolean
  mode: 'quick' | 'named'
  subdomain?: string
  zone?: string
  cloudflaredPath?: string
}

function envValue(env: NodeJS.ProcessEnv, ...names: string[]): string | undefined {
  for (const name of names) {
    const value = env[name]?.trim()
    if (value)
      return value
  }
}

function resolvePort(value: number | string): number {
  const port = Number(value)
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new TypeError(`Invalid Flash Debug port: ${value}`)
  return port
}

export function resolveFlashDebugOptions(input: {
  config: FlashDebugConfig
  cli?: FlashDebugCliOptions
  env?: NodeJS.ProcessEnv
}): ResolvedFlashDebugOptions {
  const cli = input.cli ?? {}
  const env = input.env ?? process.env
  const environment = resolveFlashNexusEnvironment(env, 'debug')
  const mode = cli.mode ?? environment.mode ?? input.config.tunnel?.mode ?? 'quick'
  if (mode !== 'quick' && mode !== 'named')
    throw new TypeError(`Invalid Flash Debug tunnel mode: ${mode}`)

  const port = resolvePort(cli.port
    ?? envValue(env, 'FLASH_DEBUG_PORT')
    ?? input.config.server?.port
    ?? DEFAULT_DEBUG_PORT)

  return {
    host: cli.host ?? envValue(env, 'FLASH_DEBUG_HOST') ?? input.config.server?.host ?? '127.0.0.1',
    port,
    tunnel: cli.tunnel ?? true,
    mode,
    subdomain: cli.subdomain
      ?? environment.subdomain
      ?? input.config.tunnel?.subdomain,
    zone: cli.zone ?? environment.zone ?? input.config.tunnel?.zone,
    cloudflaredPath: environment.cloudflaredPath
      ?? input.config.tunnel?.cloudflaredPath,
  }
}

const require = createRequire(import.meta.url)

export async function loadFlashDebugConfig(options: {
  cwd?: string
  envFile?: string
} = {}): Promise<Awaited<ReturnType<typeof loadConfig<FlashDebugConfig>>>> {
  let configModule = fileURLToPath(new URL('./index.ts', import.meta.url))
  try {
    const resolvedConfigModule = require.resolve('@flash-debug/config')
    configModule = resolvedConfigModule
  }
  catch {
    // Source tests and workspace typecheck run before the package dist exists.
  }

  const jiti = createJiti(import.meta.url, {
    fsCache: false,
    moduleCache: false,
    alias: {
      'flash-debug': configModule,
      '@flash-debug/config': configModule,
    },
  })

  const loaded = await loadConfig<FlashDebugConfig>({
    cwd: options.cwd,
    name: 'flash-debug',
    jiti,
    dotenv: options.envFile
      ? {
          fileName: [options.envFile],
        }
      : true,
  })
  validateFlashDebugConfig(loaded.config)
  return loaded
}
