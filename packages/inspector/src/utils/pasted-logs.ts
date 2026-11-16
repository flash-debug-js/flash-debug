import type { DebugLogLevel, DebugLogRecord, DebugLogSource, DebugLogType } from '@flash-debug/types'

const LEVELS: readonly DebugLogLevel[] = ['debug', 'info', 'warning', 'error']
const TYPES: readonly DebugLogType[] = [
  'log',
  'network',
  'exception',
  'performance',
  'event',
]
const SOURCES: readonly DebugLogSource[] = [
  'flutter',
  'adb',
  'harmony',
  'server',
  'unknown',
]

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isOneOf<T extends string>(value: unknown, values: readonly T[]): value is T {
  return typeof value === 'string' && values.includes(value as T)
}

function normalizeRecord(value: unknown, index: number, fallbackTimestamp: string): DebugLogRecord | undefined {
  if (!isRecord(value)) {
    return undefined
  }

  const message = typeof value.message === 'string'
    ? value.message
    : typeof value.content === 'string'
      ? value.content
      : undefined
  if (!message) {
    return undefined
  }

  return {
    ...value,
    id: typeof value.id === 'string' && value.id.length > 0
      ? value.id
      : `pasted-${Date.now()}-${index}`,
    timestamp: typeof value.timestamp === 'string' && value.timestamp.length > 0
      ? value.timestamp
      : fallbackTimestamp,
    level: isOneOf(value.level, LEVELS)
      ? value.level
      : 'info',
    type: isOneOf(value.type, TYPES)
      ? value.type
      : 'log',
    message,
    source: isOneOf(value.source, SOURCES)
      ? value.source
      : 'unknown',
  }
}

export function parsePastedLogs(text: string, now = new Date()): DebugLogRecord[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  }
  catch {
    return []
  }

  const values = Array.isArray(parsed)
    ? parsed
    : isRecord(parsed) && Array.isArray(parsed.records)
      ? parsed.records
      : [parsed]
  const fallbackTimestamp = now.toISOString()
  return values
    .map((value, index) => normalizeRecord(value, index, fallbackTimestamp))
    .filter((record): record is DebugLogRecord => record !== undefined)
}

function timestampValue(record: DebugLogRecord): number {
  const value = Date.parse(record.timestamp)
  return Number.isFinite(value)
    ? value
    : Number.MAX_SAFE_INTEGER
}

/** Merge by id and keep pasted logs in chronological order from old to new. */
export function mergePastedLogs(existing: readonly DebugLogRecord[], incoming: readonly DebugLogRecord[]): DebugLogRecord[] {
  const records = new Map<string, DebugLogRecord>()
  existing.forEach(record => records.set(record.id, record))
  incoming.forEach(record => records.set(record.id, record))

  const merged = [
    ...records.values(),
  ]
  const order = new Map(merged.map((record, index) => [record.id, index]))
  return merged.sort((left, right) => timestampValue(left) - timestampValue(right) || (order.get(left.id) ?? 0) - (order.get(right.id) ?? 0))
}
