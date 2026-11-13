import type { DebugClientAdapter, DebugDevice, DebugClientSession } from '@flash-debug/types'

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
    return [...this.adapters.values()]
  }

  async listDevices(options: { signal?: AbortSignal } = {}): Promise<DebugDevice[]> {
    const devices = await Promise.all(
      this.list().map(adapter => adapter.listDevices(options))
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

export type { DebugClientAdapter, DebugClientSession, DebugDevice } from '@flash-debug/types'
