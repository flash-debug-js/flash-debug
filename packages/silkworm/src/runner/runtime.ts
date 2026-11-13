import type { DebugLogRecord } from '@flash-debug/types'
import type {
  AutoConfig,
  AutoSnapshot,
  AutoStatus,
  ConnectionConfig,
  GeneratedLog,
  ManualEventInput,
  PublicConnection,
  RunnerSnapshot,
  RunnerStats,
  SendAttempt,
  SendMode,
} from './types'
import { DEFAULT_DEBUG_PORT } from '@flash-debug/config'
import { createScenarioRecord } from '../scenarios'
import { SeededRandom } from './random'
import { sendBatch, testTarget, TransportError } from './transport'

type SnapshotListener = (snapshot: RunnerSnapshot) => void

const defaultAutoConfig: AutoConfig = {
  scenario: 'normal',
  rate: 2,
  batchSize: 1,
  durationSeconds: 0,
  seed: 'silkworm',
  clientId: 'silkworm-01',
  deviceId: 'silkworm-device',
  flushErrors: true,
}

const defaultConnection: ConnectionConfig = {
  baseUrl: `http://127.0.0.1:${DEFAULT_DEBUG_PORT}`,
  token: '',
  clientId: 'silkworm-01',
  deviceId: 'silkworm-device',
  source: 'flutter',
}

function cloneStats(): RunnerStats {
  return {
    generated: 0,
    queued: 0,
    accepted: 0,
    failed: 0,
    duplicate: 0,
    retrying: 0,
    queueLength: 0,
  }
}

function publicConnection(connection: ConnectionConfig, state: Pick<PublicConnection, 'connected' | 'lastStatus' | 'lastLatencyMs' | 'lastError'>): PublicConnection {
  return {
    baseUrl: connection.baseUrl,
    clientId: connection.clientId,
    deviceId: connection.deviceId,
    source: connection.source,
    hasToken: Boolean(connection.token),
    ...state,
  }
}

export class SilkwormRuntime {
  private connection: ConnectionConfig = { ...defaultConnection }
  private connectionState: Pick<PublicConnection, 'connected' | 'lastStatus' | 'lastLatencyMs' | 'lastError'> = { connected: false }
  private autoStatus: AutoStatus = 'idle'
  private autoConfig: AutoConfig = { ...defaultAutoConfig }
  private autoRunId = ''
  private autoSequence = 0
  private autoRandom = new SeededRandom(defaultAutoConfig.seed)
  private autoRateCarry = 0
  private autoPending: GeneratedLog[] = []
  private autoTimer: ReturnType<typeof setInterval> | undefined
  private autoDurationTimer: ReturnType<typeof setTimeout> | undefined
  private queue = Promise.resolve()
  private history: SendAttempt[] = []
  private stats = cloneStats()
  private lastError: string | undefined
  private readonly listeners = new Set<SnapshotListener>()

  snapshot(): RunnerSnapshot {
    const auto: AutoSnapshot = {
      status: this.autoStatus,
      sequence: this.autoSequence,
      config: { ...this.autoConfig },
      ...(this.autoRunId
        ? { runId: this.autoRunId }
        : {}),
    }
    return {
      connection: publicConnection(this.connection, this.connectionState),
      auto,
      stats: { ...this.stats },
      history: this.history.slice(),
      ...(this.lastError
        ? { lastError: this.lastError }
        : {}),
    }
  }

  subscribe(listener: SnapshotListener): () => void {
    this.listeners.add(listener)
    listener(this.snapshot())
    return () => this.listeners.delete(listener)
  }

  configure(connection: Partial<ConnectionConfig>): RunnerSnapshot {
    this.connection = {
      ...this.connection,
      ...connection,
      baseUrl: connection.baseUrl?.trim() || this.connection.baseUrl,
      clientId: connection.clientId?.trim() || this.connection.clientId,
      deviceId: connection.deviceId?.trim() || this.connection.deviceId,
    }
    this.connectionState = { connected: false }
    this.emit()
    return this.snapshot()
  }

  async testConnection(): Promise<RunnerSnapshot> {
    try {
      const result = await testTarget(this.connection)
      this.connectionState = {
        connected: true,
        lastStatus: result.statusCode,
        lastLatencyMs: result.latencyMs,
      }
      this.lastError = undefined
    }
    catch (error) {
      this.connectionState = {
        connected: false,
        lastStatus: error instanceof TransportError
          ? error.statusCode
          : undefined,
        lastError: error instanceof Error
          ? error.message
          : String(error),
      }
      this.lastError = this.connectionState.lastError
      throw error
    }
    this.emit()
    return this.snapshot()
  }

  clearHistory(): RunnerSnapshot {
    this.history = []
    this.stats = cloneStats()
    this.lastError = undefined
    this.emit()
    return this.snapshot()
  }

  async startAuto(config: Partial<AutoConfig> = {}): Promise<RunnerSnapshot> {
    if (this.autoStatus === 'running' || this.autoStatus === 'starting') {
      return this.snapshot()
    }

    this.autoConfig = {
      ...this.autoConfig,
      ...config,
      rate: Math.min(100, Math.max(0.1, Number(config.rate ?? this.autoConfig.rate))),
      batchSize: Math.min(100, Math.max(1, Math.floor(Number(config.batchSize ?? this.autoConfig.batchSize)))),
      durationSeconds: Math.max(0, Number(config.durationSeconds ?? this.autoConfig.durationSeconds)),
      clientId: config.clientId?.trim() || this.autoConfig.clientId,
      deviceId: config.deviceId?.trim() || this.autoConfig.deviceId,
      seed: config.seed?.trim() || this.autoConfig.seed,
    }

    if (!this.autoRunId || this.autoStatus === 'completed' || this.autoStatus === 'stopped' || this.autoStatus === 'failed') {
      this.autoRunId = `${this.autoConfig.clientId}-${Date.now().toString(36)}`
      this.autoSequence = 0
      this.autoRandom = new SeededRandom(this.autoConfig.seed)
      this.autoRateCarry = 0
      this.autoPending = []
    }

    this.autoStatus = 'starting'
    this.emit()
    this.autoStatus = 'running'
    this.startAutoTimer()
    if (this.autoConfig.durationSeconds > 0) {
      this.autoDurationTimer = setTimeout(() => this.completeAuto(), this.autoConfig.durationSeconds * 1000)
    }
    this.emit()
    return this.snapshot()
  }

  pauseAuto(): RunnerSnapshot {
    if (this.autoStatus === 'running') {
      this.clearAutoTimers()
      this.autoStatus = 'paused'
      this.emit()
    }
    return this.snapshot()
  }

  stopAuto(): RunnerSnapshot {
    if (this.autoStatus !== 'idle') {
      this.clearAutoTimers()
      this.autoStatus = 'stopped'
      this.emit()
    }
    return this.snapshot()
  }

  async sendManual(items: GeneratedLog[], options: { summary?: string, duplicate?: boolean } = {}): Promise<RunnerSnapshot> {
    await this.enqueue('manual', items, options.summary ?? 'Manual event', options.duplicate)
    return this.snapshot()
  }

  private startAutoTimer(): void {
    this.clearAutoTimers()
    const intervalMs = 100
    this.autoTimer = setInterval(() => {
      this.autoRateCarry += this.autoConfig.rate / (1000 / intervalMs)
      const eventsPerTick = Math.floor(this.autoRateCarry)
      this.autoRateCarry -= eventsPerTick
      if (eventsPerTick > 0) {
        this.autoPending.push(...Array.from({ length: eventsPerTick }, () => this.nextAutoRecord()))
      }

      while (this.autoPending.length >= this.autoConfig.batchSize) {
        const items = this.autoPending.splice(0, this.autoConfig.batchSize)
        this.enqueueAutoBatch(items)
      }
    }, intervalMs)
  }

  private enqueueAutoBatch(items: GeneratedLog[]): void {
    if (this.autoConfig.flushErrors) {
      const errors = items.filter(item => typeof item === 'object' && item !== null && item.level === 'error')
      const regular = items.filter(item => !(typeof item === 'object' && item !== null && item.level === 'error'))
      if (errors.length > 0) {
        void this.enqueue('auto', errors, `${this.autoConfig.scenario} error`)
      }
      if (regular.length > 0) {
        void this.enqueue('auto', regular, `${this.autoConfig.scenario} scenario`)
      }
      return
    }
    void this.enqueue('auto', items, `${this.autoConfig.scenario} scenario`)
  }

  private nextAutoRecord(): GeneratedLog {
    this.autoSequence += 1
    const id = `${this.autoRunId}-${this.autoSequence}`
    const context = {
      id,
      timestamp: new Date().toISOString(),
      sequence: this.autoSequence,
      clientId: this.autoConfig.clientId,
      deviceId: this.autoConfig.deviceId,
      scenario: this.autoConfig.scenario,
      random: this.autoRandom,
    }
    return createScenarioRecord(context)
  }

  private async enqueue(mode: SendMode, items: GeneratedLog[], summary: string, duplicate = false): Promise<void> {
    this.stats.generated += items.length
    this.stats.queued += 1
    this.stats.queueLength += 1
    const attempt: SendAttempt = {
      id: `${mode}-${Date.now().toString(36)}-${this.stats.queued}`,
      mode,
      eventIds: items.map(item => typeof item.id === 'string'
        ? item.id
        : ''),
      startedAt: new Date().toISOString(),
      status: 'queued',
      summary,
    }
    this.history.unshift(attempt)
    this.history = this.history.slice(0, 500)
    this.emit()

    const task = this.queue.then(async () => {
      attempt.status = 'sent'
      this.emit()
      try {
        const result = await sendBatch(this.connection, duplicate
          ? items.map(item => ({ ...item }))
          : items)
        const duplicateCount = Math.max(0, items.length - result.accepted)
        this.stats.accepted += result.accepted
        this.stats.duplicate += duplicateCount
        attempt.status = result.accepted === 0 && items.length > 0
          ? 'duplicate'
          : 'accepted'
        attempt.statusCode = result.statusCode
        if (duplicateCount > 0) {
          attempt.error = `${duplicateCount} duplicate event${duplicateCount === 1
            ? ''
            : 's'}`
        }
        this.connectionState = {
          connected: true,
          lastStatus: result.statusCode,
          lastError: undefined,
        }
        this.lastError = undefined
      }
      catch (error) {
        this.stats.failed += items.length
        attempt.status = 'failed'
        attempt.statusCode = error instanceof TransportError
          ? error.statusCode
          : undefined
        attempt.error = error instanceof Error
          ? error.message
          : String(error)
        this.lastError = attempt.error
        this.connectionState = {
          connected: false,
          lastStatus: attempt.statusCode,
          lastError: attempt.error,
        }
      }
      finally {
        attempt.finishedAt = new Date().toISOString()
        this.stats.queueLength = Math.max(0, this.stats.queueLength - 1)
        this.emit()
      }
    })
    this.queue = task.catch(() => undefined)
    await task
  }

  private completeAuto(): void {
    if (this.autoStatus === 'running' || this.autoStatus === 'paused') {
      this.clearAutoTimers()
      if (this.autoPending.length > 0) {
        const pending = this.autoPending.splice(0)
        this.enqueueAutoBatch(pending)
      }
      this.autoStatus = 'completed'
      this.emit()
    }
  }

  private clearAutoTimers(): void {
    if (this.autoTimer) {
      clearInterval(this.autoTimer)
      this.autoTimer = undefined
    }
    if (this.autoDurationTimer) {
      clearTimeout(this.autoDurationTimer)
      this.autoDurationTimer = undefined
    }
  }

  private emit(): void {
    const snapshot = this.snapshot()
    for (const listener of this.listeners) {
      listener(snapshot)
    }
  }
}

export function manualInputToRecord(input: ManualEventInput): DebugLogRecord {
  let metadata: Record<string, unknown> | undefined
  if (input.metadata.trim()) {
    const parsed: unknown = JSON.parse(input.metadata)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('Metadata must be a JSON object')
    }
    metadata = parsed as Record<string, unknown>
  }

  return {
    id: input.id.trim() || `manual-${Date.now().toString(36)}`,
    timestamp: input.timestamp || new Date().toISOString(),
    level: input.level,
    type: input.type,
    source: input.source,
    tag: input.tag.trim() || undefined,
    deviceId: input.deviceId.trim() || undefined,
    message: input.message,
    content: input.content,
    contentFormat: input.contentFormat,
    error: input.error.trim() || undefined,
    stackTrace: input.stackTrace.trim() || undefined,
    metadata,
  }
}
