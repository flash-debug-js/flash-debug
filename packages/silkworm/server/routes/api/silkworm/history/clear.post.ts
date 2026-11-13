import { defineHandler } from 'nitro'
import { silkwormRuntime } from '../../../../state'

export default defineHandler(() => ({
  ok: true,
  snapshot: silkwormRuntime.clearHistory(),
}))
