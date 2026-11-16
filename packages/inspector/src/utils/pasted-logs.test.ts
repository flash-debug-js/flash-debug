import { describe, expect, it } from 'vitest'
import { mergePastedLogs, parsePastedLogs } from './pasted-logs'

function record(id: string, timestamp: string, message: string) {
  return {
    id,
    timestamp,
    level: 'info' as const,
    type: 'log' as const,
    source: 'flutter' as const,
    message,
  }
}

describe('pasted logs', () => {
  it('parses a single record and an array', () => {
    expect(parsePastedLogs(JSON.stringify(record('one', '2026-11-16T10:00:00.000Z', 'one')))).toHaveLength(1)
    expect(parsePastedLogs(JSON.stringify([
      record('one', '2026-11-16T10:00:00.000Z', 'one'),
      record('two', '2026-11-16T10:01:00.000Z', 'two'),
    ]))).toHaveLength(2)
  })

  it('sorts an older record above a newer record when pasted later', () => {
    const newer = record('new', '2026-11-16T10:01:00.000Z', 'new')
    const older = record('old', '2026-11-16T10:00:00.000Z', 'old')
    expect(mergePastedLogs([newer], [older]).map(item => item.id)).toEqual(['old', 'new'])
  })
})
