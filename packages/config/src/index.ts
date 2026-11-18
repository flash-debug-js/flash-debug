import { createRequire } from 'node:module'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { loadConfig } from 'c12'
import { createJiti } from 'jiti'

export const DEFAULT_DEBUG_PORT = 4517

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
    adapters?: string[]
  }
}

export function defineConfig<T extends FlashDebugConfig>(config: T): T {
  return config
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
  const mode = cli.mode ?? envValue(env, 'FLASH_DEBUG_MODE') ?? input.config.tunnel?.mode ?? 'quick'
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
      ?? envValue(env, 'FLASH_DEBUG_SUBDOMAIN', 'FLASH_DEBUG_SUB_DOMAIN')
      ?? input.config.tunnel?.subdomain,
    zone: cli.zone ?? envValue(env, 'FLASH_DEBUG_ZONE') ?? input.config.tunnel?.zone,
    cloudflaredPath: envValue(env, 'FLASH_DEBUG_CLOUDFLARED_PATH')
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

  return loadConfig<FlashDebugConfig>({
    cwd: options.cwd,
    name: 'flash-debug',
    jiti,
    dotenv: options.envFile
      ? {
          fileName: [options.envFile],
        }
      : true,
  })
}
