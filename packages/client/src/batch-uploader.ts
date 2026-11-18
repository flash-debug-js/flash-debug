export interface BatchUploaderOptions<T> {
  batchSize: number
  flushIntervalMs: number
  queueLimit?: number
  requeueOnError?: boolean
  sendBatch: (batch: readonly T[]) => Promise<void>
  onError?: (error: unknown) => void
  onDrop?: (records: readonly T[], error: unknown) => void
}

export interface BatchUploader<T> {
  append: (record: T) => void
  flush: () => Promise<void>
  close: () => Promise<void>
  readonly queueLength: number
}

export function createBatchUploader<T>(options: BatchUploaderOptions<T>): BatchUploader<T> {
  const queue: T[] = []
  const batchSize = Math.max(1, options.batchSize)
  const flushIntervalMs = Math.max(0, options.flushIntervalMs)
  let queueLimit: number | undefined
  if (options.queueLimit !== undefined) {
    queueLimit = Math.max(1, options.queueLimit)
  }
  const requeueOnError = options.requeueOnError ?? true
  let flushTimer: ReturnType<typeof setTimeout> | undefined
  let flushPromise: Promise<void> | undefined
  let closed = false

  function scheduleFlush(): void {
    if (flushTimer || flushIntervalMs === 0) {
      if (flushIntervalMs === 0) {
        void flush().catch(error => options.onError?.(error))
      }
      return
    }
    flushTimer = setTimeout(() => {
      flushTimer = undefined
      void flush().catch(error => options.onError?.(error))
    }, flushIntervalMs)
    flushTimer.unref?.()
  }

  function clearFlushTimer(): void {
    if (!flushTimer) {
      return
    }
    clearTimeout(flushTimer)
    flushTimer = undefined
  }

  async function flushQueue(): Promise<void> {
    while (queue.length > 0) {
      const batch = queue.splice(0, batchSize)
      try {
        await options.sendBatch(batch)
      }
      catch (error) {
        if (requeueOnError) {
          queue.unshift(...batch)
        }
        if (!requeueOnError) {
          options.onDrop?.(batch, error)
        }
        throw error
      }
    }
  }

  function flush(): Promise<void> {
    if (flushPromise) {
      return flushPromise
    }
    clearFlushTimer()
    const promise = flushQueue().finally(() => {
      flushPromise = undefined
    })
    flushPromise = promise
    return promise
  }

  function append(record: T): void {
    if (closed) {
      throw new Error('Batch uploader is closed')
    }
    queue.push(record)
    if (queueLimit !== undefined) {
      while (queue.length > queueLimit) {
        const dropped = queue.shift()
        if (dropped !== undefined) {
          options.onDrop?.([dropped], new Error(`Batch uploader queue limit exceeded (${queueLimit})`))
        }
      }
    }
    if (queue.length >= batchSize) {
      void flush().catch(error => options.onError?.(error))
    }
    else {
      scheduleFlush()
    }
  }

  async function close(): Promise<void> {
    if (closed) {
      return
    }
    closed = true
    clearFlushTimer()
    try {
      await flush()
    }
    finally {
      queue.length = 0
    }
  }

  return {
    append,
    flush,
    close,
    get queueLength() {
      return queue.length
    },
  }
}
