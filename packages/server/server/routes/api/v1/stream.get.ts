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

      unsubscribe = logStore.subscribe((logEvent) => {
        if (!closed) {
          controller.enqueue(encodeEvent(logEvent))
        }
      })

      heartbeat = setInterval(() => {
        if (!closed) {
          controller.enqueue(encoder.encode(': heartbeat\n\n'))
        }
      }, 15_000)

      event.req.signal.addEventListener('abort', close, { once: true })
      controller.enqueue(encoder.encode(': connected\n\n'))
    },
    cancel() {
      unsubscribe()
      if (heartbeat) {
        clearInterval(heartbeat)
      }
      closed = true
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
