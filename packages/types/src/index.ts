export type DebugLogLevel = 'debug' | 'info' | 'warning' | 'error'

export type DebugLogSource = 'flutter' | 'adb' | 'harmony' | 'server' | 'unknown'

export type DebugLogType = 'log' | 'network' | 'exception' | 'performance' | 'event'

export type DebugContentFormat = 'json' | 'jsonc' | 'jsonl' | 'yaml' | 'ansi' | 'text'

export type DebugFilterKind = 'select' | 'multi-select' | 'text' | 'number' | 'boolean'

export type DebugFilterScope = 'capture' | 'view'

export type DebugFilterApplyMode = 'restart' | 'live'

export interface DebugFilterOption {
  label: string
  value: string
}

export interface DebugFilterDefinition {
  id: string
  label: string
  kind: DebugFilterKind
  scope: DebugFilterScope
  apply: DebugFilterApplyMode
  options?: readonly DebugFilterOption[]
  defaultValue?: unknown
  placeholder?: string
  description?: string
}

export type DebugFilterValues = Record<string, unknown>

export interface DebugSourceDescriptor {
  id: string
  label: string
  source: DebugLogSource
  transport?: string
  filters: readonly DebugFilterDefinition[]
}

export interface DebugSessionSnapshot {
  connected: boolean
  adapterId?: string
  deviceId?: string
  source?: DebugSourceDescriptor
  filters: DebugFilterValues
}

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
  getSourceDescriptor?: () => DebugSourceDescriptor
  listDevices: (options?: { signal?: AbortSignal }) => Promise<DebugDevice[]>
  startLogs: (options: {
    deviceId: string
    onRecord: (record: DebugLogRecord) => void
    filters?: DebugFilterValues
    signal?: AbortSignal
  }) => Promise<DebugClientSession>
}

export interface DebugClientEventMap {
  device: DebugDevice
  log: DebugLogRecord
  session: DebugClientSession
}
