import { defineHandler, readBody } from 'nitro/h3'
import { silkwormRuntime } from '../../../state'

interface ConnectBody {
  baseUrl?: string
  token?: string
  clientId?: string
  deviceId?: string
  source?: 'flutter' | 'adb' | 'server' | 'unknown'
}

export default defineHandler(async (event) => {
  const body = await readBody<ConnectBody>(event)
  silkwormRuntime.configure(body ?? {})
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
