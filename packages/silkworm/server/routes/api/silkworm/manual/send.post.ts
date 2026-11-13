import { defineHandler, HTTPError, readBody } from 'nitro/h3'
import { silkwormRuntime } from '../../../../state'

interface ManualSendBody {
  event?: Record<string, unknown>
  batchSize?: number
  duplicate?: boolean
}

export default defineHandler(async (event) => {
  const body = await readBody<ManualSendBody>(event)
  if (!body?.event || typeof body.event !== 'object' || Array.isArray(body.event)) {
    throw new HTTPError('event must be an object', { status: 400 })
  }

  const batchSize = Math.min(100, Math.max(1, Math.floor(Number(body.batchSize ?? 1))))
  const baseId = typeof body.event.id === 'string' && body.event.id
    ? body.event.id
    : `manual-${Date.now().toString(36)}`
  const items = Array.from({ length: batchSize }, (_, index) => ({
    ...body.event,
    id: body.duplicate
      ? baseId
      : batchSize === 1
        ? baseId
        : `${baseId}-${index + 1}`,
  }))

  return {
    ok: true,
    snapshot: await silkwormRuntime.sendManual(items, {
      duplicate: body.duplicate,
      summary: `Manual ${batchSize} event${batchSize === 1
        ? ''
        : 's'}`,
    }),
  }
})
