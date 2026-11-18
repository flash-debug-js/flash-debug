import { defineHandler } from 'nitro'
import { logStore } from '../../../store'

const encoder = new TextEncoder()

function encodeEvent(event: { cursor: number, record: unknown }): Uint8Array {
  return encoder.encode(`id: ${event.cursor}\nevent: log\ndata: ${JSON.stringify(event)}\n\n`)
}

export default defineHandler((event) => {
  let unsubscribe = () => {}
  let heartbeat: ReturnType<typeof setInterval> | undefined
  let closed = false
  let closeStream = () => {}
  const queryCursor = parseCursor(event.url.searchParams.get('cursor'))
  const headerCursor = parseCursor(event.req.headers.get('last-event-id'))
  const afterCursor = Math.max(queryCursor, headerCursor)

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const close = () => {
        if (closed) {
          return
        }
        closed = true
        unsubscribe()
        if (heartbeat) {
          clearInterval(heartbeat)
        }
        try {
          controller.close()
        }
        catch {
          // The request may already have been cancelled by the client.
        }
      }
      closeStream = close

      unsubscribe = logStore.subscribe((logEvent) => {
        if (closed) {
          return
        }
        try {
          controller.enqueue(encodeEvent(logEvent))
        }
        catch {
          close()
        }
      }, afterCursor)

      heartbeat = setInterval(() => {
        if (!closed) {
          try {
            controller.enqueue(encoder.encode(': heartbeat\n\n'))
          }
          catch {
            close()
          }
        }
      }, 15_000)

      event.req.signal.addEventListener('abort', close, { once: true })
      controller.enqueue(encoder.encode(': connected\n\n'))
    },
    cancel() {
      closeStream()
    },
  })

  return new Response(stream, {
    headers: {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Connection': 'keep-alive',
      'Content-Type': 'text/event-stream; charset=utf-8',
      'X-Accel-Buffering': 'no',
    },
  })
})

function parseCursor(value: string | null): number {
  if (!value) {
    return 0
  }
  const cursor = Number(value)
  if (!Number.isSafeInteger(cursor) || cursor <= 0) {
    return 0
  }
  return cursor
}
