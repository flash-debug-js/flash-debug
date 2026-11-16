import type { DebugLogRecord } from '@flash-debug/types'

export interface LogEvent {
  cursor: number
  record: DebugLogRecord
}

type Listener = (event: LogEvent) => void

class LogStore {
  private readonly records: LogEvent[] = []
  private readonly ids = new Set<string>()
  private readonly listeners = new Set<Listener>()
  private cursor = 0
  private orderStart = 0
  private dropped = 0

  append(records: DebugLogRecord[]): { accepted: number, cursor: number } {
    let accepted = 0
    for (const record of records) {
      if (!record.id || this.ids.has(record.id)) {
        continue
      }

      const event = { cursor: ++this.cursor, record }
      this.ids.add(record.id)
      this.records.push(event)
      accepted += 1
      for (const listener of this.listeners) {
        listener(event)
      }
    }

    while (this.records.length - this.orderStart > 5000) {
      const removed = this.records[this.orderStart]
      this.orderStart += 1
      if (removed) {
        this.ids.delete(removed.record.id)
      }
      this.dropped += 1
    }

    if (this.orderStart > 1024 && this.orderStart * 2 > this.records.length) {
      this.records.splice(0, this.orderStart)
      this.orderStart = 0
    }

    return { accepted, cursor: this.cursor }
  }

  list(afterCursor = 0, limit = 2000): LogEvent[] {
    const items: LogEvent[] = []
    for (let index = this.orderStart; index < this.records.length; index += 1) {
      const event = this.records[index]
      if (!event || event.cursor <= afterCursor) {
        continue
      }
      items.push(event)
      if (items.length >= limit) {
        break
      }
    }
    return items
  }

  clear(): { deleted: number, cursor: number } {
    const deleted = this.records.length - this.orderStart
    this.records.length = 0
    this.ids.clear()
    this.orderStart = 0
    this.dropped = 0
    return { deleted, cursor: this.cursor }
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  stats(): { count: number, cursor: number, dropped: number } {
    return {
      count: this.records.length - this.orderStart,
      cursor: this.cursor,
      dropped: this.dropped,
    }
  }
}

export const logStore = new LogStore()
