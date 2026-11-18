import type { DebugFilterValues, DebugLogRecord, DebugSessionSnapshot } from '@flash-debug/types'
import type { LogWorkerClient } from '../worker/log-worker-client'
import { onBeforeUnmount, reactive, ref, shallowRef } from 'vue'

export function useLogStream(workerClient: LogWorkerClient, onError: (error: unknown) => void) {
  const connected = ref(false)
  const session = shallowRef<DebugSessionSnapshot | null>(null)
  const captureFilters = reactive<DebugFilterValues>({})
  let eventSource: EventSource | undefined
  let streamCursor = 0

  async function loadHistory(): Promise<void> {
    try {
      const response = await fetch('/api/v1/logs?limit=5000')
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }
      const payload = await response.json() as {
        cursor?: number
        items?: Array<{ cursor?: number, record: DebugLogRecord }>
      }
      const records = (payload.items ?? []).map(item => item.record)
      if (records.length) {
        await workerClient.appendBatch(records)
      }
      streamCursor = payload.items?.at(-1)?.cursor ?? payload.cursor ?? 0
    }
    catch (cause) {
      onError(cause)
    }
  }

  async function loadSession(): Promise<void> {
    try {
      const response = await fetch('/api/v1/session')
      if (!response.ok) {
        return
      }
      const nextSession = await response.json() as DebugSessionSnapshot
      session.value = nextSession
      Object.assign(captureFilters, nextSession.filters)
    }
    catch {
      // A session endpoint is optional for viewers without an active client adapter.
    }
  }

  function connectStream(): void {
    let query = ''
    if (streamCursor > 0) {
      query = `?cursor=${streamCursor}`
    }
    eventSource = new EventSource(`/api/v1/stream${query}`)
    eventSource.addEventListener('open', () => {
      connected.value = true
    })
    eventSource.addEventListener('log', (event) => {
      const payload = JSON.parse((event as MessageEvent).data) as { cursor?: number, record: DebugLogRecord }
      if (typeof payload.cursor === 'number') {
        streamCursor = Math.max(streamCursor, payload.cursor)
      }
      workerClient.enqueue(payload.record)
    })
    eventSource.addEventListener('error', () => {
      connected.value = false
      onError(new Error('Connection interrupted · retrying'))
    })
  }

  function start(): void {
    void Promise.all([
      loadSession(),
      loadHistory(),
    ]).then(connectStream)
  }

  function dispose(): void {
    eventSource?.close()
    eventSource = undefined
  }

  onBeforeUnmount(dispose)

  return {
    captureFilters,
    connected,
    session,
    start,
  }
}
