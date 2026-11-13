<script setup lang="ts">
import type { DebugLogLevel, DebugLogRecord } from '@flash-debug/types'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import LogDetailModal from './LogDetailModal.vue'
import VirtualList from './components/VirtualList.vue'

const logs = ref<DebugLogRecord[]>([])
const selected = ref<DebugLogRecord | null>(null)
const query = ref('')
const level = ref<'all' | DebugLogLevel>('all')
const source = ref<'all' | DebugLogRecord['source']>('all')
const connected = ref(false)
const error = ref('')
let eventSource: EventSource | undefined

const filteredLogs = computed(() => {
  const needle = query.value.trim().toLowerCase()
  return logs.value.filter((record) => {
    if (level.value !== 'all' && record.level !== level.value) {
      return false
    }
    if (source.value !== 'all' && record.source !== source.value) {
      return false
    }
    if (!needle) {
      return true
    }
    return [record.message, record.tag, record.deviceId, record.type]
      .filter(Boolean)
      .some(value => value!.toLowerCase().includes(needle))
  })
})

function addRecord(record: DebugLogRecord): void {
  if (logs.value.some(item => item.id === record.id)) {
    return
  }
  logs.value = [...logs.value, record].slice(-5000)
}

async function loadHistory(): Promise<void> {
  try {
    const response = await fetch('/api/v1/logs')
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
    const payload = await response.json() as { items?: Array<{ record: DebugLogRecord }> }
    for (const item of payload.items ?? []) {
      addRecord(item.record)
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

onMounted(async () => {
  await loadHistory()
  connectStream()
})

onBeforeUnmount(() => eventSource?.close())
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
        <span class="stats">{{ filteredLogs.length }} logs</span>
        <span class="connection-dot" :class="{ online: connected }" />
        <span class="stats">{{ connected ? 'Live' : 'Offline' }}</span>
      </div>
    </header>

    <section class="workspace">
      <aside class="filters glass">
        <div class="panel-heading"><strong>Sources</strong><span>{{ logs.length }}</span></div>
        <button class="filter-row" :class="{ active: source === 'all' }" type="button" @click="source = 'all'">All sources <small>{{ logs.length }}</small></button>
        <button class="filter-row" :class="{ active: source === 'flutter' }" type="button" @click="source = 'flutter'">Flutter <small>{{ logs.filter(item => item.source === 'flutter').length }}</small></button>
        <button class="filter-row" :class="{ active: source === 'adb' }" type="button" @click="source = 'adb'">ADB / Android <small>{{ logs.filter(item => item.source === 'adb').length }}</small></button>
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
          <p>Flutter, ADB and other debug sources will appear here.</p>
        </div>
        <VirtualList v-else :items="filteredLogs" :item-height="38" :item-key="record => record.id" class="log-list">
          <template #default="{ item: record }">
            <button class="log-row" type="button" @click="selected = record">
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

    <LogDetailModal :record="selected" @close="selected = null" />
  </main>
</template>
