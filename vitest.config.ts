import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const root = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  resolve: {
    alias: {
      '@flash-debug/client': resolve(root, 'packages/client/src/index.ts'),
      '@flash-debug/config/constants': resolve(root, 'packages/config/src/constants.ts'),
      '@flash-debug/config': resolve(root, 'packages/config/src/index.ts'),
      '@flash-debug/core': resolve(root, 'packages/core/src/index.ts'),
      '@flash-debug/logger-adb': resolve(root, 'packages/logger-adb/src/index.ts'),
      '@flash-debug/logger-hdc': resolve(root, 'packages/logger-hdc/src/index.ts'),
      '@flash-debug/server': resolve(root, 'packages/server/src/index.ts'),
      '@flash-debug/types': resolve(root, 'packages/types/src/index.ts'),
      '@flash-debug/cli': resolve(root, 'packages/cli/src/index.ts'),
      'flash-debug': resolve(root, 'packages/flash-debug/src/index.ts'),
    },
  },
})
