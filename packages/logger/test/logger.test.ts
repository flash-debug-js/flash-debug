import { describe, expect, it } from 'vitest'
import type { FlashDebugLogRecord } from '../src'
import { createLogger } from '../src'

function response(status: number, body = ''): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(),
    text: async () => body,
  } as Response
}

function payload(request: RequestInit): { items: FlashDebugLogRecord[], sdk: { name: string, version: string } } {
  return JSON.parse(String(request.body)) as {
    items: FlashDebugLogRecord[]
    sdk: { name: string, version: string }
  }
}

describe('Flash Debug logger', () => {
  it('builds a protocol v1 batch and sends authorization', async () => {
    const requests: RequestInit[] = []
    const logger = createLogger({
      baseUrl: 'http://127.0.0.1:4517/',
      clientId: 'insight-hub-api-local',
      source: 'insight-hub-api',
      token: 'ingest-token',
      batchSize: 1,
      fetch: async (_input, init) => {
        requests.push(init ?? {})
        return response(200)
      },
    })

    const record = logger.info('request completed', {
      type: 'http',
      attributes: { route: '/healthz' },
    })
    await logger.flush()

    expect(record.source).toBe('insight-hub-api')
    expect(requests).toHaveLength(1)
    expect(requests[0]?.headers).toEqual({
      'content-type': 'application/json',
      authorization: 'Bearer ingest-token',
    })
    expect(payload(requests[0] ?? {}).items[0]).toMatchObject({
      id: record.id,
      clientId: 'insight-hub-api-local',
      type: 'http',
    })
    expect(payload(requests[0] ?? {}).sdk.name).toBe('@flash-debug/logger')
    await logger.close()
  })

  it('retries a retryable response with the same event id', async () => {
    const ids: string[] = []
    let attempts = 0
    const logger = createLogger({
      baseUrl: 'http://127.0.0.1:4517',
      clientId: 'test',
      source: 'test',
      batchSize: 1,
      retryBaseMs: 0,
      retryMaxMs: 0,
      fetch: async (_input, init) => {
        attempts += 1
        ids.push(payload(init ?? {}).items[0]?.id ?? '')
        return attempts === 1
          ? response(503)
          : response(200)
      },
    })

    const record = logger.info('retry me')
    await logger.flush()

    expect(attempts).toBe(2)
    expect(ids).toEqual([record.id, record.id])
    await logger.close()
  })

  it('redacts secrets before enqueueing and drops the oldest record at the queue limit', async () => {
    const dropped: FlashDebugLogRecord[] = []
    const requests: RequestInit[] = []
    const logger = createLogger({
      baseUrl: 'http://127.0.0.1:4517',
      clientId: 'test',
      source: 'test',
      queueLimit: 1,
      flushIntervalMs: 60_000,
      onDrop: records => dropped.push(...records),
      fetch: async (_input, init) => {
        requests.push(init ?? {})
        return response(200)
      },
    })

    logger.info('authorization: Bearer abc', {
      attributes: {
        password: 'secret',
        visible: 'value',
      },
    })
    const latest = logger.info('latest')

    expect(dropped).toHaveLength(1)
    expect(dropped[0]?.attributes).toEqual({
      password: '[REDACTED]',
      visible: 'value',
    })
    expect(latest.message).toBe('latest')
    await logger.flush()

    expect(requests).toHaveLength(1)
    await logger.close()
  })
})
