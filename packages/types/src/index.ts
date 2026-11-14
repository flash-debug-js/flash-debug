export type DebugLogLevel = 'debug' | 'info' | 'warning' | 'error'

export type DebugLogSource = 'flutter' | 'adb' | 'harmony' | 'server' | 'unknown'

export type DebugLogType = 'log' | 'network' | 'exception' | 'performance' | 'event'

export type DebugContentFormat = 'json' | 'jsonc' | 'jsonl' | 'yaml' | 'ansi' | 'text'

export interface DebugLogRecord {
  id: string
  timestamp: string
  level: DebugLogLevel
  type: DebugLogType
  message: string
  content?: string
  contentFormat?: DebugContentFormat
  source: DebugLogSource
  tag?: string
  deviceId?: string
  sessionId?: string
  error?: string
  stackTrace?: string
  attributes?: Record<string, unknown>
  metadata?: Record<string, unknown>
}

export interface DebugDevice {
  id: string
  name?: string
  platform: 'android' | 'harmony' | 'ios' | 'web' | 'unknown'
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
  listDevices: (options?: { signal?: AbortSignal }) => Promise<DebugDevice[]>
  startLogs: (options: {
    deviceId: string
    onRecord: (record: DebugLogRecord) => void
    signal?: AbortSignal
  }) => Promise<DebugClientSession>
}

export interface DebugClientEventMap {
  device: DebugDevice
  log: DebugLogRecord
  session: DebugClientSession
}
