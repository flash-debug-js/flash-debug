import type { AutoConfig } from '../../../../../src/runner/types'
import { defineHandler, HTTPError, readBody } from 'nitro/h3'
import { silkwormRuntime } from '../../../../state'

export default defineHandler(async (event) => {
  const body = await readBody<Partial<AutoConfig>>(event)
  try {
    return {
      ok: true,
      snapshot: await silkwormRuntime.startAuto(body ?? {}),
    }
  }
  catch (error) {
    throw new HTTPError(error instanceof Error
      ? error.message
      : String(error), { status: 409 })
  }
})
