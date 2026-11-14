import { defineHandler, HTTPError } from 'nitro'
import { readBody } from 'nitro/h3'
import { requestControl } from '../../../../control'

export default defineHandler(async (event) => {
  const body = await readBody<{ filters?: unknown }>(event)
  if (!body || typeof body.filters !== 'object' || body.filters === null || Array.isArray(body.filters)) {
    throw new HTTPError('filters must be an object', { status: 400 })
  }
  return requestControl('update-filters', body.filters as Record<string, unknown>)
})
