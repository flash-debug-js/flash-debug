import { defineHandler } from 'nitro'
import { silkwormRuntime } from '../../../state'

export default defineHandler(async () => {
  try {
    const snapshot = await silkwormRuntime.testConnection()
    return { ok: true, snapshot }
  }
  catch (error) {
    return {
      ok: false,
      snapshot: silkwormRuntime.snapshot(),
      error: error instanceof Error
        ? error.message
        : String(error),
    }
  }
})
