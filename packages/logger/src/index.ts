import type { BatchUploader } from '@flash-debug/client'
import type { DebugContentFormat, DebugLogLevel, DebugLogRecord, DebugLogType } from '@flash-debug/types'
import { createBatchUploader } from '@flash-debug/client'
import { FLASH_DEBUG_SDK_VERSION } from './version'

export { FLASH_DEBUG_SDK_VERSION } from './version'

export const FLASH_DEBUG_PROTOCOL_VERSION = 1 as const
export const FLASH_DEBUG_SDK_NAME = '@flash-debug/logger'

type FetchFunction = typeof globalThis.fetch

export type FlashDebugLogLevel = DebugLogLevel
export type FlashDebugLogType = DebugLogType
export type FlashDebugContentFormat = DebugContentFormat
export type FlashDebugLogRecord = DebugLogRecord

export interface FlashDebugLogInput {
  level: FlashDebugLogLevel
  message: string
  type?: FlashDebugLogType
  content?: string
  contentFormat?: FlashDebugContentFormat
  metadata?: Record<string, unknown>
  tag?: string
  attributes?: Record<string, unknown>
  error?: unknown
  stackTrace?: string
}

export interface FlashDebugSdkInfo {
  name: string
  version: string
}

export interface FlashDebugLoggerOptions {
  baseUrl: string
  clientId: string
  source: string
  token?: string
  deviceId?: string
  sessionId?: string
  sdk?: Partial<FlashDebugSdkInfo>
  batchSize?: number
  flushIntervalMs?: number
  queueLimit?: number
  timeoutMs?: number
  closeTimeoutMs?: number
  maxRetries?: number
  retryBaseMs?: number
  retryMaxMs?: number
  fetch?: FetchFunction
  onError?: (error: unknown) => void
  onDrop?: (records: readonly FlashDebugLogRecord[], error: unknown) => void
  redact?: (record: FlashDebugLogRecord) => FlashDebugLogRecord
}

export interface FlashDebugLogger {
  log: (input: FlashDebugLogInput) => FlashDebugLogRecord
  debug: (message: string, options?: Omit<FlashDebugLogInput, 'level' | 'message'>) => FlashDebugLogRecord
  info: (message: string, options?: Omit<FlashDebugLogInput, 'level' | 'message'>) => FlashDebugLogRecord
  warning: (message: string, options?: Omit<FlashDebugLogInput, 'level' | 'message'>) => FlashDebugLogRecord
  error: (message: string, options?: Omit<FlashDebugLogInput, 'level' | 'message'>) => FlashDebugLogRecord
  flush: () => Promise<void>
  close: () => Promise<void>
  readonly queueLength: number
}

export class FlashDebugUploadError extends Error {
  readonly statusCode?: number
  readonly retryable: boolean
  readonly responseBody?: string

  constructor(
    message: string,
    options: {
      statusCode?: number
      retryable?: boolean
      responseBody?: string
    } = {},
  ) {
    super(message)
    this.name = 'FlashDebugUploadError'
    this.statusCode = options.statusCode
    this.retryable = options.retryable ?? false
    this.responseBody = options.responseBody
  }
}

interface FlashDebugBatchBody {
  protocolVersion: typeof FLASH_DEBUG_PROTOCOL_VERSION
  clientId: string
  sdk: FlashDebugSdkInfo
  items: readonly FlashDebugLogRecord[]
}

interface RetryAfterResponse extends Response {
  headers: Headers
}

const DEFAULT_BATCH_SIZE = 20
const DEFAULT_FLUSH_INTERVAL_MS = 250
const DEFAULT_QUEUE_LIMIT = 1_000
const DEFAULT_TIMEOUT_MS = 5_000
const DEFAULT_CLOSE_TIMEOUT_MS = 5_000
const DEFAULT_MAX_RETRIES = 3
const DEFAULT_RETRY_BASE_MS = 250
const DEFAULT_RETRY_MAX_MS = 10_000

const SENSITIVE_KEY_PATTERN = /authorization|cookie|password|secret|token|appkey|accesskey|privatekey|set-cookie/i
const BEARER_PATTERN = /Bearer\s+[\w.~+/=-]+/gi
const SENSITIVE_TEXT_PATTERN = /(authorization|cookie|password|secret|token|appKey|accessKey)\s*[:=]\s*("[^"]*"|'[^']*'|[^\s,;]+)/gi

export function createLogger(options: FlashDebugLoggerOptions): FlashDebugLogger {
  return new FlashDebugLoggerImpl(options)
}

class FlashDebugLoggerImpl implements FlashDebugLogger {
  private readonly endpoint: string
  private readonly clientId: string
  private readonly source: string
  private readonly token?: string
  private readonly deviceId?: string
  private readonly sessionId?: string
  private readonly sdk: FlashDebugSdkInfo
  private readonly batchSize: number
  private readonly flushIntervalMs: number
  private readonly queueLimit: number
  private readonly timeoutMs: number
  private readonly closeTimeoutMs: number
  private readonly maxRetries: number
  private readonly retryBaseMs: number
  private readonly retryMaxMs: number
  private readonly request: FetchFunction
  private readonly onError?: (error: unknown) => void
  private readonly onDrop?: (records: readonly FlashDebugLogRecord[], error: unknown) => void
  private readonly customRedact?: (record: FlashDebugLogRecord) => FlashDebugLogRecord
  private readonly uploader: BatchUploader<FlashDebugLogRecord>
  private closed = false

  constructor(options: FlashDebugLoggerOptions) {
    const baseUrl = options.baseUrl.trim().replace(/\/+$/, '')
    if (!baseUrl) {
      throw new Error('Flash Debug baseUrl is required')
    }
    if (!options.clientId.trim()) {
      throw new Error('Flash Debug clientId is required')
    }
    if (!options.source.trim()) {
      throw new Error('Flash Debug source is required')
    }

    this.endpoint = `${baseUrl}/api/v1/logs/batch`
    this.clientId = options.clientId.trim()
    this.source = options.source.trim()
    this.token = options.token?.trim() || undefined
    this.deviceId = options.deviceId?.trim() || undefined
    this.sessionId = options.sessionId?.trim() || undefined
    this.sdk = {
      name: options.sdk?.name?.trim() || FLASH_DEBUG_SDK_NAME,
      version: options.sdk?.version?.trim() || FLASH_DEBUG_SDK_VERSION,
    }
    this.batchSize = positiveInteger(options.batchSize, DEFAULT_BATCH_SIZE)
    this.flushIntervalMs = nonNegativeInteger(options.flushIntervalMs, DEFAULT_FLUSH_INTERVAL_MS)
    this.queueLimit = positiveInteger(options.queueLimit, DEFAULT_QUEUE_LIMIT)
    this.timeoutMs = positiveInteger(options.timeoutMs, DEFAULT_TIMEOUT_MS)
    this.closeTimeoutMs = positiveInteger(options.closeTimeoutMs, DEFAULT_CLOSE_TIMEOUT_MS)
    this.maxRetries = nonNegativeInteger(options.maxRetries, DEFAULT_MAX_RETRIES)
    this.retryBaseMs = positiveInteger(options.retryBaseMs, DEFAULT_RETRY_BASE_MS)
    this.retryMaxMs = positiveInteger(options.retryMaxMs, DEFAULT_RETRY_MAX_MS)
    this.request = options.fetch ?? globalThis.fetch
    if (typeof this.request !== 'function') {
      throw new TypeError('Flash Debug logger requires a fetch implementation')
    }
    this.onError = options.onError
    this.onDrop = options.onDrop
    this.customRedact = options.redact
    this.uploader = createBatchUploader({
      batchSize: this.batchSize,
      flushIntervalMs: this.flushIntervalMs,
      queueLimit: this.queueLimit,
      requeueOnError: false,
      sendBatch: batch => this.sendBatch(batch),
      onError: this.onError,
      onDrop: this.onDrop,
    })
  }

  get queueLength(): number {
    return this.uploader.queueLength
  }

  log(input: FlashDebugLogInput): FlashDebugLogRecord {
    if (this.closed) {
      throw new Error('Flash Debug logger is closed')
    }

    const record = this.redact({
      id: createEventId(),
      timestamp: new Date().toISOString(),
      level: input.level,
      type: input.type ?? 'log',
      source: this.source,
      clientId: this.clientId,
      message: input.message,
      ...(input.content !== undefined
        ? { content: input.content }
        : {}),
      ...(input.contentFormat !== undefined
        ? { contentFormat: input.contentFormat }
        : {}),
      ...(input.tag
        ? { tag: input.tag }
        : {}),
      ...(this.deviceId
        ? { deviceId: this.deviceId }
        : {}),
      ...(this.sessionId
        ? { sessionId: this.sessionId }
        : {}),
      ...(input.attributes
        ? { attributes: input.attributes }
        : {}),
      ...(input.metadata
        ? { metadata: input.metadata }
        : {}),
      ...normalizeError(input.error, input.stackTrace),
    })

    this.enqueue(record)
    return record
  }

  debug(message: string, options: Omit<FlashDebugLogInput, 'level' | 'message'> = {}): FlashDebugLogRecord {
    return this.log({ ...options, level: 'debug', message })
  }

  info(message: string, options: Omit<FlashDebugLogInput, 'level' | 'message'> = {}): FlashDebugLogRecord {
    return this.log({ ...options, level: 'info', message })
  }

  warning(message: string, options: Omit<FlashDebugLogInput, 'level' | 'message'> = {}): FlashDebugLogRecord {
    return this.log({ ...options, level: 'warning', message })
  }

  error(message: string, options: Omit<FlashDebugLogInput, 'level' | 'message'> = {}): FlashDebugLogRecord {
    return this.log({ ...options, level: 'error', message })
  }

  flush(): Promise<void> {
    return this.uploader.flush()
  }

  async close(): Promise<void> {
    if (this.closed) {
      return
    }
    this.closed = true

    try {
      await withTimeout(this.uploader.close(), this.closeTimeoutMs)
    }
    catch (error) {
      this.onError?.(error)
    }
    finally {
      this.uploader.close().catch(() => {})
    }
  }

  private enqueue(record: FlashDebugLogRecord): void {
    this.uploader.append(record)
  }

  private async sendBatch(batch: readonly FlashDebugLogRecord[]): Promise<void> {
    for (let attempt = 0; ; attempt += 1) {
      try {
        const response = await this.sendRequest(batch)
        if (response.ok) {
          return
        }

        const error = await createUploadError(response)
        if (!error.retryable || attempt >= this.maxRetries) {
          throw error
        }
        await sleep(retryDelay(attempt, this.retryBaseMs, this.retryMaxMs, response))
      }
      catch (error) {
        if (error instanceof FlashDebugUploadError && !error.retryable) {
          throw error
        }
        if (attempt >= this.maxRetries) {
          throw error
        }
        await sleep(retryDelay(attempt, this.retryBaseMs, this.retryMaxMs))
      }
    }
  }

  private async sendRequest(batch: readonly FlashDebugLogRecord[]): Promise<Response> {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs)

    const headers: Record<string, string> = {
      'content-type': 'application/json',
    }
    if (this.token) {
      headers.authorization = `Bearer ${this.token}`
    }

    const body: FlashDebugBatchBody = {
      protocolVersion: FLASH_DEBUG_PROTOCOL_VERSION,
      clientId: this.clientId,
      sdk: this.sdk,
      items: batch,
    }

    try {
      return await this.request(this.endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      })
    }
    finally {
      clearTimeout(timeout)
    }
  }

  private redact(record: FlashDebugLogRecord): FlashDebugLogRecord {
    const redacted = redactValue(record) as FlashDebugLogRecord
    if (!this.customRedact) {
      return redacted
    }
    try {
      return this.customRedact(redacted)
    }
    catch (error) {
      this.onError?.(error)
      return redacted
    }
  }
}

async function createUploadError(response: RetryAfterResponse): Promise<FlashDebugUploadError> {
  const responseBody = typeof response.text === 'function'
    ? await response.text().catch(() => '')
    : ''
  const retryable = response.status === 408
    || response.status === 429
    || response.status >= 500
  return new FlashDebugUploadError(
    `Flash Debug upload failed with HTTP ${response.status}`,
    {
      statusCode: response.status,
      retryable,
      responseBody: responseBody || undefined,
    },
  )
}

function normalizeError(error: unknown, stackTrace?: string): Pick<FlashDebugLogRecord, 'error' | 'stackTrace' | 'errorInfo'> {
  if (error === undefined && stackTrace === undefined) {
    return {}
  }

  if (error instanceof Error) {
    return {
      error: error.message,
      stackTrace: stackTrace ?? error.stack,
      errorInfo: {
        name: error.name,
        ...(readErrorCode(error)
          ? {
              code: readErrorCode(error),
            }
          : {}),
        message: error.message,
        ...(error.stack
          ? { stack: error.stack }
          : {}),
      },
    }
  }

  return {
    ...(error !== undefined
      ? {
          error: typeof error === 'string'
            ? error
            : safeStringify(error),
        }
      : {}),
    ...(stackTrace !== undefined
      ? { stackTrace }
      : {}),
  }
}

function readErrorCode(error: Error): string | undefined {
  const code = (error as Error & { code?: unknown }).code
  return typeof code === 'string' || typeof code === 'number'
    ? String(code)
    : undefined
}

function redactValue(value: unknown, seen = new WeakSet<object>()): unknown {
  if (typeof value === 'string') {
    return redactText(value)
  }
  if (typeof value === 'bigint') {
    return String(value)
  }
  if (!value || typeof value !== 'object') {
    return value
  }
  if (seen.has(value)) {
    return '[Circular]'
  }
  seen.add(value)

  if (Array.isArray(value)) {
    return value.map(item => redactValue(item, seen))
  }

  const result: Record<string, unknown> = {}
  for (const [key, entry] of Object.entries(value)) {
    result[key] = SENSITIVE_KEY_PATTERN.test(key)
      ? '[REDACTED]'
      : redactValue(entry, seen)
  }
  return result
}

function redactText(value: string): string {
  return value
    .replace(BEARER_PATTERN, 'Bearer [REDACTED]')
    .replace(SENSITIVE_TEXT_PATTERN, '$1=[REDACTED]')
}

function safeStringify(value: unknown): string {
  const redacted = redactValue(value)
  try {
    return JSON.stringify(redacted)
  }
  catch {
    return String(value)
  }
}

function createEventId(): string {
  const randomUUID = globalThis.crypto?.randomUUID
  if (typeof randomUUID === 'function') {
    return randomUUID.call(globalThis.crypto)
  }
  return `fd-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}

function positiveInteger(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) && value !== undefined && value > 0
    ? Math.floor(value)
    : fallback
}

function nonNegativeInteger(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) && value !== undefined && value >= 0
    ? Math.floor(value)
    : fallback
}

function retryDelay(
  attempt: number,
  baseMs: number,
  maxMs: number,
  response?: RetryAfterResponse,
): number {
  const retryAfter = response
    ? parseRetryAfter(response.headers.get('retry-after'))
    : undefined
  if (retryAfter !== undefined) {
    return Math.min(maxMs, retryAfter)
  }
  const exponential = Math.min(maxMs, baseMs * (2 ** attempt))
  return Math.floor(exponential * (0.5 + Math.random()))
}

function parseRetryAfter(value: string | null): number | undefined {
  if (!value) {
    return undefined
  }
  const seconds = Number(value)
  if (Number.isFinite(seconds)) {
    return Math.max(0, seconds * 1_000)
  }
  const timestamp = Date.parse(value)
  return Number.isNaN(timestamp)
    ? undefined
    : Math.max(0, timestamp - Date.now())
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, milliseconds))
}

async function withTimeout<T>(promise: Promise<T>, milliseconds: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`Flash Debug close timed out after ${milliseconds}ms`)), milliseconds)
      }),
    ])
  }
  finally {
    if (timer) {
      clearTimeout(timer)
    }
  }
}
