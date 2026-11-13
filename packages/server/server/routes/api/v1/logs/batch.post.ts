import type { DebugLogRecord } from '@flash-debug/types'
import { defineHandler, HTTPError } from 'nitro'
import { readBody } from 'nitro/h3'
import { logStore } from '../../../../store'

interface BatchBody {
  clientId?: string
  items?: DebugLogRecord[]
}

export default defineHandler(async (event) => {
  const body = await readBody<BatchBody>(event)
  if (!body || !Array.isArray(body.items)) {
    throw new HTTPError('items must be an array', { status: 400 })
  }

  const result = logStore.append(body.items)
  return {
    ok: true,
    clientId: body.clientId,
    ...result,
  }
})
