import type { AutoConfig } from '../../../../../src/runner/types'
import { defineHandler, readBody } from 'nitro/h3'
import { silkwormRuntime } from '../../../../state'

export default defineHandler(async (event) => {
  const body = await readBody<Partial<AutoConfig>>(event)
  return {
    ok: true,
    snapshot: await silkwormRuntime.startAuto(body ?? {}),
  }
})
