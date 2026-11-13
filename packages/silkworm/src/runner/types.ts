import type { DebugLogRecord, DebugLogSource } from '@flash-debug/types'

export type SilkwormScenario
  = | 'normal'
    | 'mixed-sources'
    | 'content-formats'
    | 'network'
    | 'exceptions'
    | 'burst'
    | 'duplicates'
    | 'invalid'
    | 'multi-device'
    | 'long-run'

export const SILKWORM_SCENARIOS: readonly SilkwormScenario[] = [
  'normal',
  'mixed-sources',
  'content-formats',
  'network',
  'exceptions',
  'burst',
  'duplicates',
  'invalid',
  'multi-device',
  'long-run',
]

export interface ConnectionConfig {
  baseUrl: string
  token: string
  clientId: string
  deviceId: string
  source: DebugLogSource
}

export interface PublicConnection {
  baseUrl: string
  clientId: string
  deviceId: string
  source: DebugLogSource
  connected: boolean
  hasToken: boolean
  lastStatus?: number
  lastLatencyMs?: number
  lastError?: string
}

export interface AutoConfig {
  scenario: SilkwormScenario
  rate: number
  batchSize: number
  durationSeconds: number
  seed: string
  clientId: string
  deviceId: string
  flushErrors: boolean
}

export type AutoStatus = 'idle' | 'starting' | 'running' | 'paused' | 'stopped' | 'completed' | 'failed'

export interface AutoSnapshot {
  status: AutoStatus
  runId?: string
  sequence: number
  config: AutoConfig
}

export type SendMode = 'auto' | 'manual'
export type SendStatus = 'queued' | 'sent' | 'accepted' | 'failed' | 'duplicate'

export interface SendAttempt {
  id: string
  mode: SendMode
  eventIds: string[]
  startedAt: string
  finishedAt?: string
  status: SendStatus
  statusCode?: number
  error?: string
  summary?: string
}

export interface RunnerStats {
  generated: number
  queued: number
  accepted: number
  failed: number
  duplicate: number
  retrying: number
  queueLength: number
}

export interface RunnerSnapshot {
  connection: PublicConnection
  auto: AutoSnapshot
  stats: RunnerStats
  history: SendAttempt[]
  lastError?: string
}

export type GeneratedLog = DebugLogRecord | Record<string, unknown>

export interface ManualEventInput {
  id: string
  timestamp: string
  level: DebugLogRecord['level']
  type: DebugLogRecord['type']
  source: DebugLogSource
  tag: string
  clientId: string
  deviceId: string
  contentFormat: NonNullable<DebugLogRecord['contentFormat']>
  message: string
  content: string
  error: string
  stackTrace: string
  metadata: string
}
