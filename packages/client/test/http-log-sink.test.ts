import type { DebugLogRecord } from '@flash-debug/types'
import { describe, expect, it } from 'vitest'
import { HttpLogSink } from '../src'

function record(id: string): DebugLogRecord {
  return {
    id,
    timestamp: '2026-11-14T00:00:00.000Z',
    level: 'info',
    type: 'log',
    source: 'harmony',
    message: id,
  }
}

describe('httpLogSink', () => {
  it('uploads records in batches', async () => {
    const requests: RequestInit[] = []
    const sink = new HttpLogSink({
      baseUrl: 'http://127.0.0.1:4517/',
      clientId: 'hdc-test',
      batchSize: 2,
      flushIntervalMs: 60_000,
      fetch: async (_input, init) => {
        requests.push(init ?? {})
        return { ok: true, status: 200 } as Response
      },
    })

    sink.append(record('one'))
    sink.append(record('two'))
    await sink.flush()

    expect(requests).toHaveLength(1)
    expect(requests[0]?.method).toBe('POST')
    expect(JSON.parse(String(requests[0]?.body))).toEqual({
      protocolVersion: 1,
      clientId: 'hdc-test',
      items: [
        record('one'),
        record('two'),
      ],
    })
    await sink.close()
  })

  it('keeps a failed batch for a later flush', async () => {
    let attempts = 0
    const sink = new HttpLogSink({
      baseUrl: 'http://127.0.0.1:4517',
      clientId: 'hdc-test',
      flushIntervalMs: 60_000,
      fetch: async () => {
        attempts += 1
        return attempts === 1
          ? { ok: false, status: 503 } as Response
          : { ok: true, status: 200 } as Response
      },
    })

    sink.append(record('retry'))
    await expect(sink.flush()).rejects.toThrow('HTTP 503')
    await sink.flush()
    expect(attempts).toBe(2)
    await sink.close()
  })
})
