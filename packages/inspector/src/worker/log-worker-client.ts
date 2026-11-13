import type { DebugLogRecord } from '@flash-debug/types'
import type * as Comlink from 'comlink'
import type { LogFilter, LogSnapshot, LogWorkerApi } from './log-worker-types'
import { createEmptyLogSnapshot } from './log-worker-types'
import { createManagedWorker } from './managed-worker'

const MAX_BATCH_SIZE = 100
const FLUSH_DELAY_MS = 16
const RETRY_DELAY_MS = 1000

export interface LogWorkerClientOptions {
  onError?: (error: unknown) => void
}

export interface LogWorkerClient {
  appendBatch: (records: readonly DebugLogRecord[]) => Promise<LogSnapshot>
  enqueue: (record: DebugLogRecord) => void
  setFilter: (filter: LogFilter) => Promise<LogSnapshot>
  getRecord: (id: string) => Promise<DebugLogRecord | null>
  subscribe: (listener: (snapshot: LogSnapshot) => void) => () => void
  dispose: () => void
}

export function createLogWorkerClient(options: LogWorkerClientOptions = {}): LogWorkerClient {
  const manager = createManagedWorker<LogWorkerApi>(() => new Worker(
    new URL('./log-data.worker.ts', import.meta.url),
    { type: 'module', name: 'flash-debug-log-data' },
  ))
  const listeners = new Set<(snapshot: LogSnapshot) => void>()
  let snapshot = createEmptyLogSnapshot()
  let operationQueue = Promise.resolve()
  let pendingRecords: DebugLogRecord[] = []
  let flushTimer: ReturnType<typeof setTimeout> | undefined
  let flushing = false
  let disposed = false
  let filterRevision = 0

  function publish(nextSnapshot: LogSnapshot): LogSnapshot {
    snapshot = nextSnapshot
    for (const listener of listeners) {
      listener(snapshot)
    }
    return snapshot
  }

  function runOperation<T>(operation: (api: Comlink.Remote<LogWorkerApi>) => Promise<T>): Promise<T> {
    const nextOperation = operationQueue.then(async () => operation(await manager.start()))
    operationQueue = nextOperation.then(() => undefined, () => undefined)
    return nextOperation
  }

  function appendBatch(records: readonly DebugLogRecord[]): Promise<LogSnapshot> {
    if (!records.length) {
      return Promise.resolve(snapshot)
    }

    return runOperation(async (api) => {
      try {
        return publish(await api.appendBatch(records))
      }
      catch (error) {
        manager.terminate()
        throw error
      }
    })
  }

  function scheduleFlush(delay = FLUSH_DELAY_MS): void {
    if (disposed || flushTimer) {
      return
    }
    flushTimer = setTimeout(() => {
      flushTimer = undefined
      void flush()
    }, delay)
  }

  async function flush(): Promise<void> {
    if (disposed || flushing || !pendingRecords.length) {
      return
    }

    flushing = true
    const batch = pendingRecords.splice(0, MAX_BATCH_SIZE)
    try {
      await appendBatch(batch)
    }
    catch (error) {
      pendingRecords.unshift(...batch)
      options.onError?.(error)
      scheduleFlush(RETRY_DELAY_MS)
    }
    finally {
      flushing = false
      if (pendingRecords.length) {
        scheduleFlush()
      }
    }
  }

  function enqueue(record: DebugLogRecord): void {
    if (disposed) {
      return
    }
    pendingRecords.push(record)
    if (pendingRecords.length >= MAX_BATCH_SIZE) {
      void flush()
    }
    else {
      scheduleFlush()
    }
  }

  function setFilter(filter: LogFilter): Promise<LogSnapshot> {
    const revision = ++filterRevision
    return runOperation(async (api) => {
      if (revision !== filterRevision) {
        return snapshot
      }

      try {
        const nextSnapshot = await api.setFilter(filter)
        if (revision === filterRevision) {
          return publish(nextSnapshot)
        }
        return snapshot
      }
      catch (error) {
        manager.terminate()
        if (revision === filterRevision) {
          throw error
        }
        return snapshot
      }
    })
  }

  function getRecord(id: string): Promise<DebugLogRecord | null> {
    return runOperation(async (api) => {
      try {
        return await api.getRecord(id)
      }
      catch (error) {
        manager.terminate()
        throw error
      }
    })
  }

  function subscribe(listener: (nextSnapshot: LogSnapshot) => void): () => void {
    listeners.add(listener)
    listener(snapshot)
    return () => listeners.delete(listener)
  }

  function dispose(): void {
    disposed = true
    if (flushTimer) {
      clearTimeout(flushTimer)
    }
    pendingRecords = []
    listeners.clear()
    manager.terminate()
  }

  return {
    appendBatch,
    enqueue,
    setFilter,
    getRecord,
    subscribe,
    dispose,
  }
}
