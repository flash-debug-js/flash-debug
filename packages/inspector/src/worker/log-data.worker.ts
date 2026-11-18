import type { DebugLogLevel, DebugLogRecord, DebugLogSource, DebugLogType } from '@flash-debug/types'
import type { LogFilter, LogListItem, LogSnapshot, LogWorkerApi } from './log-worker-types'
import { expose } from 'comlink'
import { MAX_LIST_MESSAGE_LENGTH, MAX_LOG_RECORDS } from './log-worker-types'

interface StoredRecord {
  record: DebugLogRecord
  searchText: string
}

const records = new Map<string, StoredRecord>()
const orderedIds: string[] = []
const sourceCounts = new Map<DebugLogSource, number>()
const levelCounts = new Map<DebugLogLevel, number>()
const typeCounts = new Map<DebugLogType, number>()
const filterOptions = new Map<string, Map<string, number>>()
let orderStart = 0
let filter: LogFilter = {
  query: '',
  levels: [],
  source: 'all',
}

function incrementCount<T extends string>(counts: Map<T, number>, value: T): void {
  counts.set(value, (counts.get(value) ?? 0) + 1)
}

function decrementCount<T extends string>(counts: Map<T, number>, value: T): void {
  const count = counts.get(value) ?? 0
  if (count <= 1) {
    counts.delete(value)
  }
  else {
    counts.set(value, count - 1)
  }
}

function normalizeSearchText(record: DebugLogRecord): string {
  return [
    record.message,
    record.tag,
    record.deviceId,
    record.type,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}

function appendRecord(record: DebugLogRecord): void {
  if (!record.id || records.has(record.id)) {
    return
  }

  records.set(record.id, {
    record,
    searchText: normalizeSearchText(record),
  })
  orderedIds.push(record.id)
  incrementCount(sourceCounts, record.source)
  incrementCount(levelCounts, record.level)
  incrementCount(typeCounts, record.type)
  addFilterOption('tag', record.tag)
  addFilterOption('deviceId', record.deviceId)
  addFilterOption('domain', readAttribute(record, 'domain'))
  addFilterOption('pid', readAttribute(record, 'pid'))
}

function addFilterOption(key: string, value: unknown): void {
  if (value === undefined || value === null || String(value).length === 0) {
    return
  }
  const values = filterOptions.get(key) ?? new Map<string, number>()
  const normalized = String(value)
  values.set(normalized, (values.get(normalized) ?? 0) + 1)
  filterOptions.set(key, values)
}

function removeFilterOption(key: string, value: unknown): void {
  if (value === undefined || value === null || String(value).length === 0) {
    return
  }
  const values = filterOptions.get(key)
  if (!values) {
    return
  }
  const normalized = String(value)
  const count = values.get(normalized) ?? 0
  if (count <= 1) {
    values.delete(normalized)
  }
  else {
    values.set(normalized, count - 1)
  }
  if (!values.size) {
    filterOptions.delete(key)
  }
}

function readAttribute(record: DebugLogRecord, key: string): unknown {
  return record.attributes?.[key]
}

function removeRecord(id: string): void {
  const stored = records.get(id)
  if (!stored) {
    return
  }

  records.delete(id)
  decrementCount(sourceCounts, stored.record.source)
  decrementCount(levelCounts, stored.record.level)
  decrementCount(typeCounts, stored.record.type)
  removeFilterOption('tag', stored.record.tag)
  removeFilterOption('deviceId', stored.record.deviceId)
  removeFilterOption('domain', readAttribute(stored.record, 'domain'))
  removeFilterOption('pid', readAttribute(stored.record, 'pid'))
}

function trimRecords(): void {
  while (orderedIds.length - orderStart > MAX_LOG_RECORDS) {
    const id = orderedIds[orderStart]
    orderStart += 1
    if (id) {
      removeRecord(id)
    }
  }

  if (orderStart > 1024 && orderStart * 2 > orderedIds.length) {
    orderedIds.splice(0, orderStart)
    orderStart = 0
  }
}

function toListItem(record: DebugLogRecord): LogListItem {
  return {
    id: record.id,
    timestamp: record.timestamp,
    level: record.level,
    type: record.type,
    message: record.message.length > MAX_LIST_MESSAGE_LENGTH
      ? `${record.message.slice(0, MAX_LIST_MESSAGE_LENGTH)}…`
      : record.message,
    source: record.source,
  }
}

function toCountItems<T extends string>(counts: Map<T, number>): Array<{ value: T, count: number }> {
  const items: Array<{ value: T, count: number }> = []
  for (const [value, count] of counts) {
    items.push({ value, count })
  }
  return items
}

function toFilterOptions(): Record<string, string[]> {
  const result: Record<string, string[]> = {}
  for (const [key, values] of filterOptions) {
    const options = Array.from(values.keys())
    options.sort()
    result[key] = options
  }
  return result
}

function getSnapshot(): LogSnapshot {
  const query = filter.query.trim().toLowerCase()
  const items: LogListItem[] = []

  for (let index = orderStart; index < orderedIds.length; index += 1) {
    const id = orderedIds[index]
    if (!id) {
      continue
    }

    const stored = records.get(id)
    if (!stored) {
      continue
    }

    const { record } = stored
    if (filter.levels.length && !filter.levels.includes(record.level)) {
      continue
    }
    if (filter.source !== 'all' && record.source !== filter.source) {
      continue
    }
    if (query && !stored.searchText.includes(query)) {
      continue
    }

    items.push(toListItem(record))
  }

  return {
    items,
    total: items.length,
    stored: records.size,
    sources: toCountItems(sourceCounts),
    levels: toCountItems(levelCounts),
    types: toCountItems(typeCounts),
    filterOptions: toFilterOptions(),
  }
}

const api: LogWorkerApi = {
  ready() {},
  appendBatch(batch) {
    for (const record of batch) {
      appendRecord(record)
    }
    trimRecords()
    return getSnapshot()
  },
  setFilter(nextFilter) {
    filter = {
      query: nextFilter.query,
      levels: [...nextFilter.levels],
      source: nextFilter.source,
    }
    return getSnapshot()
  },
  getSnapshot,
  getRecord(id) {
    return records.get(id)?.record ?? null
  },
  clear() {
    records.clear()
    orderedIds.length = 0
    orderStart = 0
    sourceCounts.clear()
    levelCounts.clear()
    typeCounts.clear()
    filterOptions.clear()
    return getSnapshot()
  },
}

expose(api)
