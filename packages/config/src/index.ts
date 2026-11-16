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
