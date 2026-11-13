<script setup lang="ts">
import type { DebugLogLevel, DebugLogSource, DebugLogType } from '@flash-debug/types'
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import type { AutoConfig, ConnectionConfig, ManualEventInput, RunnerSnapshot, SilkwormScenario } from './runner/types'

const scenarios: readonly SilkwormScenario[] = ['normal', 'mixed-sources', 'content-formats', 'network', 'exceptions', 'burst', 'duplicates', 'invalid', 'multi-device', 'long-run']
const levels: readonly DebugLogLevel[] = ['debug', 'info', 'warning', 'error']
const types: readonly DebugLogType[] = ['log', 'network', 'exception', 'performance', 'event']
const sources: readonly DebugLogSource[] = ['flutter', 'adb', 'server', 'unknown']
const formats = ['json', 'jsonl', 'yaml', 'ansi', 'text'] as const

const connection = reactive<ConnectionConfig>({
  baseUrl: 'http://127.0.0.1:4317',
  token: '',
  clientId: 'silkworm-01',
  deviceId: 'silkworm-device',
  source: 'flutter',
})

const auto = reactive<AutoConfig>({
  scenario: 'normal',
  rate: 2,
  batchSize: 1,
  durationSeconds: 0,
  seed: 'silkworm',
  clientId: 'silkworm-01',
  deviceId: 'silkworm-device',
  flushErrors: true,
})

const manual = reactive<ManualEventInput>({
  id: 'manual-1',
  timestamp: new Date().toISOString(),
  level: 'info',
  type: 'log',
  source: 'flutter',
  tag: 'Silkworm',
  clientId: 'silkworm-01',
  deviceId: 'silkworm-device',
  contentFormat: 'text',
  message: 'Manual test event',
  content: 'Hello from Silkworm',
  error: '',
  stackTrace: '',
  metadata: '{\n  "source": "manual"\n}',
})

const snapshot = ref<RunnerSnapshot>({
  connection: { baseUrl: connection.baseUrl, clientId: connection.clientId, deviceId: connection.deviceId, source: connection.source, connected: false, hasToken: false },
  auto: { status: 'idle', sequence: 0, config: { ...auto } },
  stats: { generated: 0, queued: 0, accepted: 0, failed: 0, duplicate: 0, retrying: 0, queueLength: 0 },
  history: [],
})
const message = ref('')
const error = ref('')
const manualBatchSize = ref(1)
const duplicateManualId = ref(false)
const previewOpen = ref(false)
let stream: EventSource | undefined

const autoRunning = computed(() => snapshot.value.auto.status === 'running' || snapshot.value.auto.status === 'starting')
const autoPaused = computed(() => snapshot.value.auto.status === 'paused')
const connected = computed(() => snapshot.value.connection.connected)
const previewPayload = computed(() => {
  try {
    return JSON.stringify(buildManualEvent(), null, 2)
  }
  catch (cause) {
    return cause instanceof Error ? cause.message : String(cause)
  }
})

function applySnapshot(next: RunnerSnapshot): void {
  snapshot.value = next
  Object.assign(auto, next.auto.config)
}

async function request<T extends { snapshot?: RunnerSnapshot }>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const payload = await response.json() as T & { error?: string }
  if (!response.ok) {
    throw new Error(payload.error ?? `HTTP ${response.status}`)
  }
  if (payload.snapshot) {
    applySnapshot(payload.snapshot)
  }
  return payload
}

async function connect(): Promise<void> {
  await runAction(async () => {
    const payload = await request<{ ok: boolean, snapshot: RunnerSnapshot, error?: string }>('/api/silkworm/connect', connection)
    message.value = payload.ok ? 'Connected to target' : payload.error ?? 'Target is unavailable'
  })
}

async function testConnection(): Promise<void> {
  await runAction(async () => {
    const payload = await request<{ ok: boolean, snapshot: RunnerSnapshot, error?: string }>('/api/silkworm/test')
    message.value = payload.ok ? `Health check passed in ${payload.snapshot.connection.lastLatencyMs ?? 0}ms` : payload.error ?? 'Health check failed'
  })
}

async function startAuto(): Promise<void> {
  await runAction(async () => {
    await request('/api/silkworm/auto/start', { ...auto })
    message.value = `Auto mode ${auto.scenario} started`
  })
}

async function pauseAuto(): Promise<void> {
  await runAction(async () => {
    await request('/api/silkworm/auto/pause')
    message.value = 'Auto mode paused'
  })
}

async function stopAuto(): Promise<void> {
  await runAction(async () => {
    await request('/api/silkworm/auto/stop')
    message.value = 'Auto mode stopped'
  })
}

function buildManualEvent(): Record<string, unknown> {
  let metadata: unknown
  if (manual.metadata.trim()) {
    metadata = JSON.parse(manual.metadata)
  }
  return {
    id: manual.id.trim() || `manual-${Date.now().toString(36)}`,
    timestamp: manual.timestamp || new Date().toISOString(),
    level: manual.level,
    type: manual.type,
    source: manual.source,
    tag: manual.tag.trim() || undefined,
    clientId: manual.clientId.trim() || connection.clientId,
    deviceId: manual.deviceId.trim() || connection.deviceId,
    contentFormat: manual.contentFormat,
    message: manual.message,
    content: manual.content,
    error: manual.error.trim() || undefined,
    stackTrace: manual.stackTrace.trim() || undefined,
    metadata,
  }
}

async function sendManual(): Promise<void> {
  await runAction(async () => {
    const event = buildManualEvent()
    await request('/api/silkworm/manual/send', {
      event,
      batchSize: Math.min(100, Math.max(1, Number(manualBatchSize.value))),
      duplicate: duplicateManualId.value,
    })
    message.value = 'Manual payload queued'
  })
}

function resetManual(): void {
  manual.id = 'manual-1'
  manual.timestamp = new Date().toISOString()
  manual.level = 'info'
  manual.type = 'log'
  manual.source = connection.source
  manual.tag = 'Silkworm'
  manual.clientId = connection.clientId
  manual.deviceId = connection.deviceId
  manual.contentFormat = 'text'
  manual.message = 'Manual test event'
  manual.content = 'Hello from Silkworm'
  manual.error = ''
  manual.stackTrace = ''
  manual.metadata = '{\n  "source": "manual"\n}'
  manualBatchSize.value = 1
  duplicateManualId.value = false
}

async function clearHistory(): Promise<void> {
  await runAction(async () => {
    await request('/api/silkworm/history/clear')
    message.value = 'History cleared'
  })
}

async function runAction(action: () => Promise<void>): Promise<void> {
  error.value = ''
  try {
    await action()
  }
  catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause)
  }
}

function formatTime(value: string): string {
  return new Date(value).toLocaleTimeString()
}

function statusClass(status: string): string {
  return `status-${status}`
}

onMounted(async () => {
  await runAction(async () => {
    await request('/api/silkworm/state')
  })
  stream = new EventSource('/api/silkworm/stream')
  stream.addEventListener('state', (event) => {
    applySnapshot(JSON.parse((event as MessageEvent).data) as RunnerSnapshot)
  })
  stream.addEventListener('error', () => {
    error.value = 'Control stream interrupted · retrying'
  })
})

onBeforeUnmount(() => stream?.close())
</script>

<template>
  <main class="app-shell">
    <header class="topbar panel">
      <div class="brand">
        <img class="brand-mark" src="/icons/silkworm/icon-128.png" alt="" aria-hidden="true" />
        <div><strong>Flash Debug</strong><span>Silkworm</span></div>
      </div>
      <div class="target-status" :class="{ online: connected }">
        <span class="status-dot" />
        <span>{{ connected ? 'Connected' : 'Not connected' }}</span>
        <small>{{ connection.baseUrl }}</small>
      </div>
      <div class="top-actions">
        <button class="button secondary" type="button" @click="testConnection">Test request</button>
        <button class="button primary" type="button" @click="connect">Connect</button>
      </div>
    </header>

    <section class="connection panel">
      <div class="section-title"><div><strong>Target connection</strong><span>Shared by Auto Mode and Manual Send</span></div><span class="hint">Token is kept in memory only</span></div>
      <div class="form-grid connection-grid">
        <label class="field wide"><span>Target Base URL</span><input v-model="connection.baseUrl" type="url" placeholder="https://xxx.trycloudflare.com" /></label>
        <label class="field wide"><span>Ingest token</span><input v-model="connection.token" type="password" placeholder="Optional bearer token" /></label>
        <label class="field"><span>Client ID</span><input v-model="connection.clientId" type="text" /></label>
        <label class="field"><span>Device ID</span><input v-model="connection.deviceId" type="text" /></label>
        <label class="field"><span>Default source</span><select v-model="connection.source"><option v-for="item in sources" :key="item" :value="item">{{ item }}</option></select></label>
      </div>
    </section>

    <section class="control-grid">
      <article class="panel mode-panel">
        <div class="section-title"><div><strong>Auto Mode</strong><span>Generate complete JSON events</span></div><span class="mode-state" :class="statusClass(snapshot.auto.status)">{{ snapshot.auto.status }}</span></div>
        <div class="form-grid">
          <label class="field"><span>Scenario</span><select v-model="auto.scenario"><option v-for="item in scenarios" :key="item" :value="item">{{ item }}</option></select></label>
          <label class="field"><span>Events / second</span><input v-model.number="auto.rate" type="number" min="0.1" max="100" step="0.1" /></label>
          <label class="field"><span>Batch size</span><input v-model.number="auto.batchSize" type="number" min="1" max="100" /></label>
          <label class="field"><span>Duration seconds</span><input v-model.number="auto.durationSeconds" type="number" min="0" placeholder="0 = forever" /></label>
          <label class="field wide"><span>Seed</span><input v-model="auto.seed" type="text" /></label>
          <label class="field"><span>Auto client ID</span><input v-model="auto.clientId" type="text" /></label>
          <label class="field"><span>Auto device ID</span><input v-model="auto.deviceId" type="text" /></label>
        </div>
        <label class="check-row"><input v-model="auto.flushErrors" type="checkbox" /><span>Flush error events immediately</span></label>
        <div class="button-row">
          <button class="button primary" type="button" :disabled="autoRunning" @click="startAuto">{{ autoPaused ? 'Resume' : 'Start' }}</button>
          <button class="button secondary" type="button" :disabled="!autoRunning" @click="pauseAuto">Pause</button>
          <button class="button danger" type="button" :disabled="snapshot.auto.status === 'idle'" @click="stopAuto">Stop</button>
        </div>
      </article>

      <article class="panel mode-panel">
        <div class="section-title"><div><strong>Manual Send</strong><span>Construct one complete event or a batch</span></div><button class="link-button" type="button" @click="resetManual">Reset</button></div>
        <div class="form-grid">
          <label class="field wide"><span>Event ID</span><input v-model="manual.id" type="text" /></label>
          <label class="field wide"><span>Timestamp</span><input v-model="manual.timestamp" type="text" /></label>
          <label class="field"><span>Client ID</span><input v-model="manual.clientId" type="text" /></label>
          <label class="field"><span>Device ID</span><input v-model="manual.deviceId" type="text" /></label>
          <label class="field"><span>Level</span><select v-model="manual.level"><option v-for="item in levels" :key="item" :value="item">{{ item }}</option></select></label>
          <label class="field"><span>Type</span><select v-model="manual.type"><option v-for="item in types" :key="item" :value="item">{{ item }}</option></select></label>
          <label class="field"><span>Source</span><select v-model="manual.source"><option v-for="item in sources" :key="item" :value="item">{{ item }}</option></select></label>
          <label class="field"><span>Content format</span><select v-model="manual.contentFormat"><option v-for="item in formats" :key="item" :value="item">{{ item }}</option></select></label>
          <label class="field"><span>Tag</span><input v-model="manual.tag" type="text" /></label>
          <label class="field wide"><span>Message</span><input v-model="manual.message" type="text" /></label>
          <label class="field wide"><span>Content</span><textarea v-model="manual.content" rows="4" spellcheck="false" /></label>
          <label class="field wide"><span>Error</span><input v-model="manual.error" type="text" /></label>
          <label class="field wide"><span>Stack trace</span><textarea v-model="manual.stackTrace" rows="3" spellcheck="false" /></label>
          <label class="field wide"><span>Metadata JSON</span><textarea v-model="manual.metadata" rows="3" spellcheck="false" /></label>
        </div>
        <div class="manual-options">
          <label class="field compact"><span>Batch count</span><input v-model.number="manualBatchSize" type="number" min="1" max="100" /></label>
          <label class="check-row"><input v-model="duplicateManualId" type="checkbox" /><span>Duplicate event ID</span></label>
        </div>
        <div class="button-row">
          <button class="button primary" type="button" @click="sendManual">Send</button>
          <button class="button secondary" type="button" @click="previewOpen = true">Preview payload</button>
        </div>
      </article>
    </section>

    <section class="stats-row">
      <div class="stat panel"><span>Generated</span><strong>{{ snapshot.stats.generated }}</strong></div>
      <div class="stat panel"><span>Accepted</span><strong class="success-text">{{ snapshot.stats.accepted }}</strong></div>
      <div class="stat panel"><span>Failed</span><strong class="error-text">{{ snapshot.stats.failed }}</strong></div>
      <div class="stat panel"><span>Duplicate</span><strong>{{ snapshot.stats.duplicate }}</strong></div>
      <div class="stat panel"><span>Queue</span><strong>{{ snapshot.stats.queueLength }}</strong></div>
    </section>

    <section class="panel history-panel">
      <div class="section-title"><div><strong>Send History</strong><span>Latest 500 attempts</span></div><div class="history-actions"><span v-if="message" class="message">{{ message }}</span><span v-if="error" class="error-message">{{ error }}</span><button class="link-button" type="button" @click="clearHistory">Clear history</button></div></div>
      <div v-if="!snapshot.history.length" class="empty-state"><strong>No send attempts yet</strong><span>Connect a target, then start Auto Mode or send a manual event.</span></div>
      <div v-else class="history-list">
        <div v-for="attempt in snapshot.history" :key="attempt.id" class="history-row">
          <time>{{ formatTime(attempt.startedAt) }}</time>
          <span class="mode-pill">{{ attempt.mode }}</span>
          <span class="history-summary">{{ attempt.summary }}</span>
          <span class="attempt-count">{{ attempt.eventIds.length }} events</span>
          <span class="status-pill" :class="statusClass(attempt.status)">{{ attempt.status }}</span>
          <span class="history-error">{{ attempt.error ?? '' }}</span>
        </div>
      </div>
    </section>

    <div v-if="previewOpen" class="modal-backdrop" @click.self="previewOpen = false">
      <section class="preview-modal panel">
        <div class="section-title"><div><strong>Payload preview</strong><span>Authorization is never included here</span></div><button class="link-button" type="button" @click="previewOpen = false">Close</button></div>
        <pre>{{ previewPayload }}</pre>
      </section>
    </div>
  </main>
</template>
