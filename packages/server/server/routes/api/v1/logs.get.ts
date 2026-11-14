import { defineHandler } from 'nitro'
import { logStore } from '../../../store'

export default defineHandler((event) => {
  const cursor = Number(event.url.searchParams.get('cursor') ?? '0')
  const requestedLimit = Number(event.url.searchParams.get('limit') ?? '2000')
  const limit = Number.isFinite(requestedLimit)
    ? Math.min(2000, Math.max(1, Math.floor(requestedLimit)))
    : 2000
  return {
    items: logStore.list(Number.isFinite(cursor)
      ? cursor
      : 0, limit),
    ...logStore.stats(),
  }
})
