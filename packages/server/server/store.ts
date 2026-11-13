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

    while (this.records.length > 5000) {
      const removed = this.records.shift()
      if (removed) {
        this.ids.delete(removed.record.id)
      }
    }

    return { accepted, cursor: this.cursor }
  }

  list(afterCursor = 0): LogEvent[] {
    return this.records.filter(event => event.cursor > afterCursor)
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  stats(): { count: number, cursor: number } {
    return { count: this.records.length, cursor: this.cursor }
  }
}

export const logStore = new LogStore()
