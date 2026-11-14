import type { DebugClientAdapter, DebugClientSession, DebugDevice, DebugLogRecord } from '@flash-debug/types'

export class ClientRegistry {
  private readonly adapters = new Map<string, DebugClientAdapter>()

  register(adapter: DebugClientAdapter): void {
    if (this.adapters.has(adapter.id)) {
      throw new Error(`Debug client adapter already registered: ${adapter.id}`)
    }
    this.adapters.set(adapter.id, adapter)
  }

  get(id: string): DebugClientAdapter | undefined {
    return this.adapters.get(id)
  }

  list(): DebugClientAdapter[] {
    return [
      ...this.adapters.values(),
    ]
  }

  async listDevices(options: { signal?: AbortSignal } = {}): Promise<DebugDevice[]> {
    const devices = await Promise.all(
      this.list().map(adapter => adapter.listDevices(options)),
    )
    return devices.flat()
  }

  startLogs(options: {
    adapterId: string
    deviceId: string
    onRecord: Parameters<DebugClientAdapter['startLogs']>[0]['onRecord']
    signal?: AbortSignal
  }): Promise<DebugClientSession> {
    const adapter = this.adapters.get(options.adapterId)
    if (!adapter) {
      throw new Error(`Unknown debug client adapter: ${options.adapterId}`)
    }
    return adapter.startLogs(options)
  }
}

export interface DebugLogSink {
  append: (record: DebugLogRecord) => void
  flush: () => Promise<void>
  close: () => Promise<void>
}

export interface HttpLogSinkOptions {
  baseUrl: string
  clientId: string
  batchSize?: number
  flushIntervalMs?: number
  fetch?: typeof globalThis.fetch
  onError?: (error: unknown) => void
}

/** Batches client adapter records into the local Flash Debug ingest endpoint. */
export class HttpLogSink implements DebugLogSink {
  private readonly endpoint: string
  private readonly batchSize: number
  private readonly flushIntervalMs: number
  private readonly clientId: string
  private readonly request: typeof globalThis.fetch
  private readonly onError?: (error: unknown) => void
  private readonly queue: DebugLogRecord[] = []
  private flushTimer: ReturnType<typeof setTimeout> | undefined
  private flushPromise: Promise<void> | undefined
  private closed = false

  constructor(options: HttpLogSinkOptions) {
    this.endpoint = `${options.baseUrl.trim().replace(/\/+$/, '')}/api/v1/logs/batch`
    this.clientId = options.clientId
    this.batchSize = Math.max(1, options.batchSize ?? 20)
    this.flushIntervalMs = Math.max(0, options.flushIntervalMs ?? 250)
    this.request = options.fetch ?? globalThis.fetch
    this.onError = options.onError
  }

  append(record: DebugLogRecord): void {
    if (this.closed) {
      throw new Error('Debug log sink is closed')
    }
    this.queue.push(record)
    if (this.queue.length >= this.batchSize) {
      void this.flush().catch(error => this.onError?.(error))
    }
    else {
      this.scheduleFlush()
    }
  }

  flush(): Promise<void> {
    if (this.flushPromise) {
      return this.flushPromise
    }
    this.clearFlushTimer()
    const promise = this.flushQueue().finally(() => {
      this.flushPromise = undefined
    })
    this.flushPromise = promise
    return promise
  }

  async close(): Promise<void> {
    if (this.closed) {
      return
    }
    this.closed = true
    this.clearFlushTimer()
    await this.flush()
  }

  private async flushQueue(): Promise<void> {
    while (this.queue.length > 0) {
      const batch = this.queue.splice(0, this.batchSize)
      try {
        const response = await this.request(this.endpoint, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            protocolVersion: 1,
            clientId: this.clientId,
            items: batch,
          }),
        })
        if (!response.ok) {
          throw new Error(`Flash Debug upload failed with HTTP ${response.status}`)
        }
      }
      catch (error) {
        this.queue.unshift(...batch)
        throw error
      }
    }
  }

  private scheduleFlush(): void {
    if (this.flushTimer || this.flushIntervalMs === 0) {
      if (this.flushIntervalMs === 0) {
        void this.flush().catch(error => this.onError?.(error))
      }
      return
    }
    this.flushTimer = setTimeout(() => {
      this.flushTimer = undefined
      void this.flush().catch(error => this.onError?.(error))
    }, this.flushIntervalMs)
    this.flushTimer.unref?.()
  }

  private clearFlushTimer(): void {
    if (!this.flushTimer) {
      return
    }
    clearTimeout(this.flushTimer)
    this.flushTimer = undefined
  }
}

export type { DebugClientAdapter, DebugClientSession, DebugDevice } from '@flash-debug/types'
