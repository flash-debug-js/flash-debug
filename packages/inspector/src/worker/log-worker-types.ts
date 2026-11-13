import type { DebugLogLevel, DebugLogRecord, DebugLogSource, DebugLogType } from '@flash-debug/types'

export interface LogFilter {
  query: string
  level: 'all' | DebugLogLevel
  source: 'all' | DebugLogSource
}

export interface LogListItem {
  id: string
  timestamp: string
  level: DebugLogLevel
  type: DebugLogType
  message: string
  source: DebugLogSource
}

export interface LogCountItem<T extends string = string> {
  value: T
  count: number
}

export interface LogSnapshot {
  items: LogListItem[]
  total: number
  stored: number
  sources: LogCountItem<DebugLogSource>[]
  levels: LogCountItem<DebugLogLevel>[]
  types: LogCountItem<DebugLogType>[]
}

export interface LogWorkerApi {
  ready: () => void
  appendBatch: (records: readonly DebugLogRecord[]) => LogSnapshot
  setFilter: (filter: LogFilter) => LogSnapshot
  getSnapshot: () => LogSnapshot
  getRecord: (id: string) => DebugLogRecord | null
  clear: () => LogSnapshot
}

export const MAX_LOG_RECORDS = 5000
export const MAX_LIST_MESSAGE_LENGTH = 512

export function createEmptyLogSnapshot(): LogSnapshot {
  return {
    items: [],
    total: 0,
    stored: 0,
    sources: [],
    levels: [],
    types: [],
  }
}
