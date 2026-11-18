import type { DebugLogRecord } from '@flash-debug/types'
import { beforeEach, describe, expect, it } from 'vitest'
import { logStore } from '../server/store'

function record(id: string): DebugLogRecord {
  return {
    id,
    timestamp: '2026-11-18T00:00:00.000Z',
    level: 'info',
    type: 'log',
    source: 'server',
    message: id,
  }
}

describe('logStore', () => {
  beforeEach(() => {
    logStore.clear()
  })

  it('replays events after a cursor when a stream subscribes', () => {
    logStore.append([
      record('first'),
      record('second'),
    ])
    const received: string[] = []
    const unsubscribe = logStore.subscribe(
      event => received.push(event.record.id),
      1,
    )

    expect(received).toEqual(['second'])
    unsubscribe()
  })

  it('removes listeners that fail during notification', () => {
    let calls = 0
    logStore.subscribe(() => {
      calls += 1
      throw new Error('closed stream')
    })

    expect(() => logStore.append([
      record('first'),
      record('second'),
    ])).not.toThrow()
    expect(calls).toBe(1)
  })
})
