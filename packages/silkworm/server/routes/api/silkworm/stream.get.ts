import { defineHandler } from 'nitro'
import { silkwormRuntime } from '../../../state'

const encoder = new TextEncoder()

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
          // The browser may have already closed the connection.
        }
      }

      unsubscribe = silkwormRuntime.subscribe((snapshot) => {
        if (!closed) {
          controller.enqueue(encoder.encode(`event: state\ndata: ${JSON.stringify(snapshot)}\n\n`))
        }
      })
      heartbeat = setInterval(() => {
        if (!closed) {
          controller.enqueue(encoder.encode(': heartbeat\n\n'))
        }
      }, 15_000)
      event.req.signal.addEventListener('abort', close, { once: true })
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
