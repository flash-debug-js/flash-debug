import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { loadFlashDebugConfig, resolveFlashDebugOptions, validateFlashDebugConfig } from '../src'

describe('loadFlashDebugConfig', () => {
  it('loads JSON configuration from the working directory', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'flash-debug-config-'))
    try {
      await writeFile(join(cwd, 'flash-debug.config.json'), JSON.stringify({
        server: { port: 4521 },
        tunnel: {
          mode: 'named',
          zone: 'acewill.dev',
          subdomain: 'fd-{rand:4}',
        },
      }))

      const loaded = await loadFlashDebugConfig({ cwd })

      expect(loaded.config).toEqual({
        server: { port: 4521 },
        tunnel: {
          mode: 'named',
          zone: 'acewill.dev',
          subdomain: 'fd-{rand:4}',
        },
      })
    }
    finally {
      await rm(cwd, { recursive: true, force: true })
    }
  })

  it('resolves environment values before file configuration', () => {
    const resolved = resolveFlashDebugOptions({
      config: {
        server: { host: '127.0.0.1', port: 4517 },
        tunnel: {
          mode: 'quick',
          zone: 'config.example.com',
          subdomain: 'config-{rand:4}',
        },
      },
      env: {
        FLASH_DEBUG_HOST: '0.0.0.0',
        FLASH_DEBUG_PORT: '4522',
        FLASH_DEBUG_MODE: 'named',
        FLASH_DEBUG_ZONE: 'env.example.com',
        FLASH_DEBUG_SUB_DOMAIN: 'env-{rand:6}',
      },
    })

    expect(resolved).toMatchObject({
      host: '0.0.0.0',
      port: 4522,
      mode: 'named',
      zone: 'env.example.com',
      subdomain: 'env-{rand:6}',
    })
  })

  it('rejects unknown configuration fields', () => {
    expect(() => validateFlashDebugConfig({
      tunnel: { mode: 'quick' },
      typo: true,
    })).toThrow('Unknown configuration field: config.typo')
  })
})
