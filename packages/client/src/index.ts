import type { DebugClientAdapter, DebugClientSession, DebugDevice, DebugLogRecord } from '@flash-debug/types'
import { createBatchUploader } from './batch-uploader'

export { createBatchUploader } from './batch-uploader'
export type { BatchUploader } from './batch-uploader'

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
  private readonly clientId: string
  private readonly request: typeof globalThis.fetch
  private readonly uploader: ReturnType<typeof createBatchUploader<DebugLogRecord>>

  constructor(options: HttpLogSinkOptions) {
    this.endpoint = `${options.baseUrl.trim().replace(/\/+$/, '')}/api/v1/logs/batch`
    this.clientId = options.clientId
    this.request = options.fetch ?? globalThis.fetch
    this.uploader = createBatchUploader({
      batchSize: options.batchSize ?? 20,
      flushIntervalMs: options.flushIntervalMs ?? 250,
      sendBatch: async (batch) => {
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
      },
      onError: options.onError,
    })
  }

  get queueLength(): number {
    return this.uploader.queueLength
  }

  append(record: DebugLogRecord): void {
    this.uploader.append(record)
  }

  flush(): Promise<void> {
    return this.uploader.flush()
  }

  close(): Promise<void> {
    return this.uploader.close()
  }
}

export type { DebugClientAdapter, DebugClientSession, DebugDevice } from '@flash-debug/types'
