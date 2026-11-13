import type { DebugLogRecord } from '@flash-debug/types'
import type { ConnectionConfig, GeneratedLog } from './types'

export interface BatchResponse {
  accepted: number
  cursor?: number
  statusCode: number
}

export class TransportError extends Error {
  readonly statusCode?: number

  constructor(message: string, statusCode?: number) {
    super(message)
    this.name = 'TransportError'
    this.statusCode = statusCode
  }
}

function targetUrl(connection: ConnectionConfig, path: string): string {
  const baseUrl = connection.baseUrl.trim()
  if (!baseUrl) {
    throw new TransportError('Target Base URL is required')
  }
  return new URL(path, `${baseUrl.replace(/\/$/, '')}/`).toString()
}

async function readPayload(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text()
  if (!text) {
    return {}
  }
  try {
    return JSON.parse(text) as Record<string, unknown>
  }
  catch {
    return { message: text }
  }
}

export async function testTarget(connection: ConnectionConfig): Promise<{ statusCode: number, latencyMs: number }> {
  const startedAt = Date.now()
  let response: Response
  try {
    response = await fetch(targetUrl(connection, '/healthz'), {
      signal: AbortSignal.timeout(3_000),
    })
  }
  catch (error) {
    throw new TransportError(error instanceof Error
      ? error.message
      : String(error))
  }
  if (!response.ok) {
    throw new TransportError(`Target health check failed with HTTP ${response.status}`, response.status)
  }
  return { statusCode: response.status, latencyMs: Date.now() - startedAt }
}

export async function sendBatch(connection: ConnectionConfig, items: GeneratedLog[]): Promise<BatchResponse> {
  let response: Response
  try {
    response = await fetch(targetUrl(connection, '/api/v1/logs/batch'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(connection.token.trim()
          ? { Authorization: `Bearer ${connection.token.trim()}` }
          : {}),
      },
      body: JSON.stringify({
        clientId: connection.clientId,
        items: items as DebugLogRecord[],
      }),
      signal: AbortSignal.timeout(10_000),
    })
  }
  catch (error) {
    throw new TransportError(error instanceof Error
      ? error.message
      : String(error))
  }

  const payload = await readPayload(response)
  if (!response.ok) {
    const message = typeof payload.message === 'string'
      ? payload.message
      : `Target rejected request with HTTP ${response.status}`
    throw new TransportError(message, response.status)
  }

  return {
    accepted: typeof payload.accepted === 'number'
      ? payload.accepted
      : 0,
    cursor: typeof payload.cursor === 'number'
      ? payload.cursor
      : undefined,
    statusCode: response.status,
  }
}
