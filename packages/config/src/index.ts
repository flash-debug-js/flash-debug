export interface FlashDebugConfig {
  server?: {
    host?: string
    port?: number
  }
  tunnel?: {
    mode?: 'quick' | 'named'
    hostname?: string
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
