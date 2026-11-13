export type DebugLogLevel = 'debug' | 'info' | 'warning' | 'error'

export type DebugLogSource = 'flutter' | 'adb' | 'server' | 'unknown'

export interface DebugLogRecord {
  id: string
  timestamp: string
  level: DebugLogLevel
  message: string
  source: DebugLogSource
  tag?: string
  deviceId?: string
  sessionId?: string
  error?: string
  stackTrace?: string
  attributes?: Record<string, unknown>
}

export interface DebugDevice {
  id: string
  name?: string
  platform: 'android' | 'ios' | 'web' | 'unknown'
  transport: string
  state: 'online' | 'offline' | 'unauthorized' | 'unknown'
  metadata?: Record<string, string>
}

export interface DebugClientSession {
  id: string
  device: DebugDevice
  stop: () => Promise<void>
}

export interface DebugClientAdapter {
  readonly id: string
  readonly capabilities: readonly string[]
  listDevices(options?: { signal?: AbortSignal }): Promise<DebugDevice[]>
  startLogs(options: {
    deviceId: string
    onRecord: (record: DebugLogRecord) => void
    signal?: AbortSignal
  }): Promise<DebugClientSession>
}

export interface DebugClientEventMap {
  device: DebugDevice
  log: DebugLogRecord
  session: DebugClientSession
}
