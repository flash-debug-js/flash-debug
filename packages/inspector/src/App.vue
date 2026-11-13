<script setup lang="ts">
import type { DebugLogLevel, DebugLogRecord } from '@flash-debug/types'
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import LogDetailModal from './LogDetailModal.vue'
import VirtualList from './components/VirtualList.vue'
import { createLogWorkerClient } from './worker/log-worker-client'
import type { LogListItem, LogSnapshot } from './worker/log-worker-types'
import { createEmptyLogSnapshot } from './worker/log-worker-types'

const logSnapshot = shallowRef<LogSnapshot>(createEmptyLogSnapshot())
const selected = shallowRef<DebugLogRecord | null>(null)
const selectedId = ref<string | null>(null)
const query = ref('')
const level = ref<'all' | DebugLogLevel>('all')
const source = ref<'all' | DebugLogRecord['source']>('all')
const connected = ref(false)
const error = ref('')
const workerClient = createLogWorkerClient({
  onError: (cause) => {
    error.value = cause instanceof Error ? cause.message : String(cause)
  },
})
const unsubscribeWorker = workerClient.subscribe((snapshot) => {
  logSnapshot.value = snapshot
})
let eventSource: EventSource | undefined

const filteredLogs = computed(() => logSnapshot.value.items)
const sourceOptions = computed(() => logSnapshot.value.sources.map(item => item.value))

function addRecord(record: DebugLogRecord): void {
  workerClient.enqueue(record)
}

watch(sourceOptions, (items) => {
  if (source.value !== 'all' && !items.includes(source.value)) {
    source.value = 'all'
  }
})

watch([query, level, source], ([nextQuery, nextLevel, nextSource]) => {
  void workerClient.setFilter({
    query: nextQuery,
    level: nextLevel,
    source: nextSource,
  }).catch((cause: unknown) => {
    error.value = cause instanceof Error ? cause.message : String(cause)
  })
})

async function loadHistory(): Promise<void> {
  try {
    const response = await fetch('/api/v1/logs')
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
    const payload = await response.json() as { items?: Array<{ record: DebugLogRecord }> }
    const records = (payload.items ?? []).map(item => item.record)
    if (records.length) {
      await workerClient.appendBatch(records)
    }
  }
  catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause)
  }
}

function connectStream(): void {
  eventSource = new EventSource('/api/v1/stream')
  eventSource.addEventListener('open', () => {
    connected.value = true
    error.value = ''
  })
  eventSource.addEventListener('log', (event) => {
    const payload = JSON.parse((event as MessageEvent).data) as { record: DebugLogRecord }
    addRecord(payload.record)
  })
  eventSource.addEventListener('error', () => {
    connected.value = false
    error.value = 'Connection interrupted · retrying'
  })
}

function handleKeydown(event: KeyboardEvent): void {
  if (!selectedId.value) {
    return
  }

  if (event.key === 'Escape') {
    event.preventDefault()
    closeRecord()
    return
  }

  if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') {
    return
  }

  const records = filteredLogs.value
  const currentIndex = records.findIndex(record => record.id === selectedId.value)
  if (currentIndex < 0) {
    return
  }

  const nextIndex = event.key === 'ArrowUp' ? currentIndex - 1 : currentIndex + 1
  if (nextIndex < 0 || nextIndex >= records.length) {
    return
  }

  const nextRecord = records[nextIndex]
  if (!nextRecord) {
    return
  }

  event.preventDefault()
  void openRecord(nextRecord)
}

async function openRecord(item: LogListItem): Promise<void> {
  const requestId = item.id
  selectedId.value = requestId
  try {
    const record = await workerClient.getRecord(requestId)
    if (selectedId.value === requestId) {
      selected.value = record
    }
  }
  catch (cause) {
    if (selectedId.value === requestId) {
      selected.value = null
      error.value = cause instanceof Error ? cause.message : String(cause)
    }
  }
}

function closeRecord(): void {
  selectedId.value = null
  selected.value = null
}

onMounted(() => {
  window.addEventListener('keydown', handleKeydown)
  void loadHistory().then(connectStream)
})

onBeforeUnmount(() => {
  eventSource?.close()
  window.removeEventListener('keydown', handleKeydown)
  unsubscribeWorker()
  workerClient.dispose()
})
</script>

<template>
  <main class="app-shell">
    <header class="topbar glass">
      <div class="brand">
        <img class="brand-mark" src="/icons/inspector/icon-128.png" alt="" aria-hidden="true" />
        <div><strong>Flash Debug</strong><span>Inspector</span></div>
      </div>
      <label class="search">
        <span>⌕</span>
        <input v-model="query" type="search" placeholder="Search logs" />
        <kbd>/</kbd>
      </label>
      <div class="header-actions">
        <span class="stats">{{ logSnapshot.total }} logs</span>
        <span class="connection-dot" :class="{ online: connected }" />
        <span class="stats">{{ connected ? 'Live' : 'Offline' }}</span>
      </div>
    </header>

    <section class="workspace">
      <aside class="filters glass">
        <div class="panel-heading"><strong>Sources</strong><span>{{ logSnapshot.stored }}</span></div>
        <button class="filter-row" :class="{ active: source === 'all' }" type="button" @click="source = 'all'">All sources <small>{{ logSnapshot.stored }}</small></button>
        <button v-for="item in logSnapshot.sources" :key="item.value" class="filter-row" :class="{ active: source === item.value }" type="button" @click="source = item.value">{{ item.value }} <small>{{ item.count }}</small></button>
        <div class="filter-section">
          <span class="filter-label">Level</span>
          <button v-for="item in ['all', 'debug', 'info', 'warning', 'error']" :key="item" class="filter-row" :class="{ active: level === item }" type="button" @click="level = item as typeof level">{{ item }}</button>
        </div>
      </aside>

      <section class="log-panel glass">
        <header class="log-panel-header">
          <div><strong>All logs</strong><span>Complete JSON events</span></div>
          <span v-if="error" class="transport-error">{{ error }}</span>
        </header>
        <div v-if="!filteredLogs.length" class="empty-state">
          <h2>Waiting for logs</h2>
          <p>Received debug sources will appear here.</p>
        </div>
        <VirtualList v-else :items="filteredLogs" :item-height="38" :item-key="record => record.id" class="log-list">
          <template #default="{ item: record }">
            <button class="log-row" type="button" @click="void openRecord(record)">
              <time>{{ new Date(record.timestamp).toLocaleTimeString() }}</time>
              <span class="level-badge" :class="`level-${record.level}`">{{ record.level }}</span>
              <span class="source-badge">{{ record.source }}</span>
              <span class="log-type">{{ record.type }}</span>
              <span class="log-message">{{ record.message }}</span>
            </button>
          </template>
        </VirtualList>
      </section>
    </section>

    <LogDetailModal :record="selected" @close="closeRecord" />
  </main>
</template>
