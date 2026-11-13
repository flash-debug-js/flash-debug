import { defineHandler } from 'nitro'
import { logStore } from '../../../store'

export default defineHandler((event) => {
  const cursor = Number(event.url.searchParams.get('cursor') ?? '0')
  return {
    items: logStore.list(Number.isFinite(cursor)
      ? cursor
      : 0),
    ...logStore.stats(),
  }
})
