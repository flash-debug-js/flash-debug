import type { DebugLogRecord } from '@flash-debug/types'
import type { HTTPEvent } from 'h3'
import process from 'node:process'
import { defineHandler, HTTPError } from 'nitro'
import { readBody } from 'nitro/h3'
import { logStore } from '../../../../store'

interface BatchBody {
  protocolVersion?: number
  clientId?: string
  sdk?: {
    name?: string
    version?: string
  }
  items?: unknown[]
}

export default defineHandler(async (event) => {
  verifyIngestToken(event)
  const body = await readBody<BatchBody>(event)
  if (!body || typeof body !== 'object' || !Array.isArray(body.items) || body.items.length === 0) {
    throw new HTTPError('items must be a non-empty array', { status: 400 })
  }
  if (body.protocolVersion !== undefined && body.protocolVersion !== 1) {
    throw new HTTPError('unsupported protocol version', { status: 400 })
  }
  if (body.items.length > 100) {
    throw new HTTPError('items must contain at most 100 records', { status: 413 })
  }

  const items = body.items.map((item, index) => validateRecord(item, index))
  const result = logStore.append(items)
  return {
    ok: true,
    clientId: body.clientId,
    sdk: body.sdk,
    ...result,
  }
})

function verifyIngestToken(event: HTTPEvent): void {
  const expected = process.env.FLASH_DEBUG_INGEST_TOKEN?.trim()
  if (!expected) {
    return
  }

  const authorization = event.req.headers.get('authorization')
  if (authorization !== `Bearer ${expected}`) {
    throw new HTTPError('invalid ingest token', { status: 401 })
  }
}

function validateRecord(value: unknown, index: number): DebugLogRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new HTTPError(`items[${index}] must be an object`, { status: 400 })
  }

  const record = value as Partial<DebugLogRecord>
  if (
    typeof record.id !== 'string'
    || typeof record.timestamp !== 'string'
    || typeof record.level !== 'string'
    || typeof record.source !== 'string'
    || typeof record.message !== 'string'
  ) {
    throw new HTTPError(`items[${index}] is missing required fields`, { status: 400 })
  }

  if (!['debug', 'info', 'warning', 'error'].includes(record.level)) {
    throw new HTTPError(`items[${index}].level is invalid`, { status: 400 })
  }

  return record as DebugLogRecord
}
