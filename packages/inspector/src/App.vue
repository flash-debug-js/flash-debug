<script setup lang="ts">
import type { DebugFilterDefinition, DebugFilterValues, DebugLogLevel, DebugLogRecord, DebugSessionSnapshot } from '@flash-debug/types'
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, shallowRef, watch } from 'vue'
import LogDetailModal from './LogDetailModal.vue'
import IconGlyph from './components/IconGlyph.vue'
import type { IconName } from './components/IconGlyph.vue'
import VirtualList from './components/VirtualList.vue'
import { usePersistentState } from './utils/persistent-state'
import { useRangeSelection } from './utils/range-selection'
import { createLogWorkerClient } from './worker/log-worker-client'
import type { LogListItem, LogSnapshot } from './worker/log-worker-types'
import { createEmptyLogSnapshot } from './worker/log-worker-types'

const logSnapshot = shallowRef<LogSnapshot>(createEmptyLogSnapshot())
const selected = shallowRef<DebugLogRecord | null>(null)
const selectedId = ref<string | null>(null)
const selectedLogIds = ref<string[]>([])
const query = ref('')
const levelOptions: readonly DebugLogLevel[] = ['debug', 'info', 'warning', 'error']
const selectedLevels = usePersistentState<DebugLogLevel[]>('levels', [])
const source = usePersistentState<'all' | DebugLogRecord['source']>('source', 'all')
const connected = ref(false)
const error = ref('')
const session = shallowRef<DebugSessionSnapshot | null>(null)
const captureFilters = reactive<DebugFilterValues>({})
const applyingCaptureFilters = ref(false)
const autoScroll = usePersistentState('auto-scroll', true)
const compactRows = usePersistentState('compact-rows', false)
const logListRef = ref<{ scrollToEnd: () => void } | null>(null)
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
const filteredLogIds = computed(() => filteredLogs.value.map(record => record.id))
const levelSelection = useRangeSelection(() => levelOptions, selectedLevels)
const logSelection = useRangeSelection(() => filteredLogIds.value, selectedLogIds)
const sourceOptions = computed(() => logSnapshot.value.sources.map(item => item.value))
const captureFilterDefinitions = computed(() => session.value?.source?.filters.filter(filter => filter.scope === 'capture') ?? [])
const captureFilterOptions = computed(() => logSnapshot.value.filterOptions)
const activeFilterChips = computed(() => {
  const chips: Array<{ label: string, value: string, kind?: 'level' }> = []
  if (source.value !== 'all') {
    chips.push({ label: 'Source', value: source.value })
  }
  for (const value of selectedLevels.value) {
    chips.push({ label: '', value, kind: 'level' })
  }

  for (const definition of captureFilterDefinitions.value) {
    const value = filterValue(definition)
    if (Array.isArray(value) && value.length) {
      chips.push({ label: definition.label, value: value.join(', ') })
    }
    else if (typeof value === 'boolean' && value) {
      chips.push({ label: definition.label, value: 'on' })
    }
    else if (typeof value === 'string' && value.trim()) {
      chips.push({ label: definition.label, value: value.trim() })
    }
    else if (typeof value === 'number' && Number.isFinite(value)) {
      chips.push({ label: definition.label, value: String(value) })
    }
  }

  return chips
})

function addRecord(record: DebugLogRecord): void {
  workerClient.enqueue(record)
}

function levelIcon(value: 'all' | DebugLogLevel): IconName {
  switch (value) {
    case 'debug':
      return 'spark'
    case 'info':
      return 'info'
    case 'warning':
      return 'warning'
    case 'error':
      return 'error'
    default:
      return 'activity'
  }
}

function handleLevelClick(value: DebugLogLevel, event: MouseEvent): void {
  levelSelection.handleClick(value, event)
}

function clearLevelSelection(): void {
  levelSelection.clear()
}

function toggleLevelCheckbox(value: DebugLogLevel): void {
  levelSelection.toggle(value)
}

function sourceIcon(value: 'all' | DebugLogRecord['source']): IconName {
  return value === 'all' ? 'layers' : value === 'server' ? 'activity' : 'database'
}

watch(sourceOptions, (items) => {
  if (source.value !== 'all' && !items.includes(source.value)) {
    source.value = 'all'
  }
})

watch([query, selectedLevels, source], ([nextQuery, nextLevels, nextSource]) => {
  void workerClient.setFilter({
    query: nextQuery,
    levels: [...nextLevels],
    source: nextSource,
  }).catch((cause: unknown) => {
    error.value = cause instanceof Error ? cause.message : String(cause)
  })
}, { immediate: true })

async function loadHistory(): Promise<void> {
  try {
    const response = await fetch('/api/v1/logs?limit=2000')
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

async function loadSession(): Promise<void> {
  try {
    const response = await fetch('/api/v1/session')
    if (!response.ok) {
      return
    }
    const nextSession = await response.json() as DebugSessionSnapshot
    session.value = nextSession
    Object.assign(captureFilters, nextSession.filters)
  }
  catch {
    // A session endpoint is optional for viewers without an active client adapter.
  }
}

async function updateCaptureFilter(id: string, value: unknown): Promise<void> {
  const previous = { ...captureFilters }
  captureFilters[id] = value
  applyingCaptureFilters.value = true
  try {
    const response = await fetch('/api/v1/session/filters', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ filters: { ...captureFilters } }),
    })
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
    const nextSession = await response.json() as DebugSessionSnapshot
    session.value = nextSession
    Object.keys(captureFilters).forEach((key) => {
      delete captureFilters[key]
    })
    Object.assign(captureFilters, nextSession.filters)
  }
  catch (cause) {
    Object.keys(captureFilters).forEach((key) => {
      delete captureFilters[key]
    })
    Object.assign(captureFilters, previous)
    error.value = cause instanceof Error ? cause.message : String(cause)
  }
  finally {
    applyingCaptureFilters.value = false
  }
}

function selectFilterValue(event: Event): string {
  return (event.target as HTMLSelectElement).value
}

function multiSelectFilterValue(event: Event): string[] {
  return Array.from((event.target as HTMLSelectElement).selectedOptions).map(option => option.value)
}

function filterValue(definition: DebugFilterDefinition): unknown {
  return captureFilters[definition.id] ?? definition.defaultValue ?? ''
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

function toggleAutoScroll(): void {
  autoScroll.value = !autoScroll.value
  if (autoScroll.value) {
    void nextTick(() => logListRef.value?.scrollToEnd())
  }
}

function handleLogListScroll(state: { atBottom: boolean, user: boolean }): void {
  if (state.user) {
    autoScroll.value = false
  }
}

function selectLog(item: LogListItem, event: MouseEvent): void {
  logSelection.handleClick(item.id, event)
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
  void Promise.all([loadSession(), loadHistory()]).then(connectStream)
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
      <nav class="tool-nav" aria-label="Inspector navigation">
        <button class="tool-nav-button disabled" type="button" aria-label="Back" disabled><span aria-hidden="true">‹</span></button>
        <span class="tool-nav-item active"><IconGlyph name="layers" :size="15" />Logs</span>
        <button class="tool-nav-item disabled" type="button" disabled title="Filters are shown in the sidebar"><IconGlyph name="filter" :size="15" />Filters</button>
      </nav>
      <label class="search">
        <IconGlyph name="search" :size="15" />
        <input v-model="query" type="search" placeholder="Search logs" />
        <kbd>/</kbd>
      </label>
      <div class="header-actions">
        <span class="stats">{{ logSnapshot.total }} logs</span>
        <IconGlyph name="activity" :size="14" class="status-signal" :class="{ online: connected }" />
        <span class="stats">{{ connected ? 'Live' : 'Offline' }}</span>
      </div>
    </header>

    <section class="workspace">
      <aside class="filters glass">
        <div class="sidebar-brand">
          <img class="sidebar-brand-mark" src="/icons/inspector/icon-128.png" alt="" aria-hidden="true" />
          <div><strong>Flash Debug</strong><span>Inspector</span></div>
        </div>
        <div class="sidebar-divider" aria-hidden="true" />
        <div class="panel-heading"><span class="panel-heading-title"><IconGlyph name="layers" :size="15" /><strong>Sources</strong></span><span>{{ logSnapshot.stored }}</span></div>
        <button class="filter-row" :class="{ active: source === 'all' }" type="button" @click="source = 'all'"><span class="filter-row-label"><IconGlyph :name="sourceIcon('all')" :size="14" />All Sources</span><small>{{ logSnapshot.stored }}</small></button>
        <button v-for="item in logSnapshot.sources" :key="item.value" class="filter-row" :class="{ active: source === item.value }" type="button" @click="source = item.value"><span class="filter-row-label"><IconGlyph :name="sourceIcon(item.value)" :size="14" />{{ item.value }}</span><small>{{ item.count }}</small></button>
        <div v-if="captureFilterDefinitions.length" class="filter-section capture-filters">
          <div class="filter-label capture-filter-heading">
            <span><IconGlyph name="filter" :size="13" />Device filters</span>
            <small v-if="applyingCaptureFilters">Applying…</small>
          </div>
          <div v-for="definition in captureFilterDefinitions" :key="definition.id" class="capture-filter">
            <label :for="`capture-filter-${definition.id}`">{{ definition.label }}</label>
            <select
              v-if="definition.kind === 'select'"
              :id="`capture-filter-${definition.id}`"
              :value="String(filterValue(definition))"
              :disabled="applyingCaptureFilters"
              @change="void updateCaptureFilter(definition.id, selectFilterValue($event))"
            >
              <option v-for="option in definition.options ?? []" :key="option.value" :value="option.value">{{ option.label }}</option>
            </select>
            <select
              v-else-if="definition.kind === 'multi-select'"
              :id="`capture-filter-${definition.id}`"
              multiple
              :value="(filterValue(definition) as string[])"
              :disabled="applyingCaptureFilters"
              @change="void updateCaptureFilter(definition.id, multiSelectFilterValue($event))"
            >
              <option v-for="option in definition.options ?? []" :key="option.value" :value="option.value">{{ option.label }}</option>
            </select>
            <input
              v-else-if="definition.kind === 'number'"
              :id="`capture-filter-${definition.id}`"
              type="number"
              :value="String(filterValue(definition))"
              :placeholder="definition.placeholder"
              :disabled="applyingCaptureFilters"
              @input="captureFilters[definition.id] = ($event.target as HTMLInputElement).value"
              @change="void updateCaptureFilter(definition.id, Number(($event.target as HTMLInputElement).value) || undefined)"
            />
            <input
              v-else
              :id="`capture-filter-${definition.id}`"
              :type="definition.kind === 'boolean' ? 'checkbox' : 'text'"
              :list="captureFilterOptions[definition.id]?.length ? `capture-options-${definition.id}` : undefined"
              :value="definition.kind === 'boolean' ? undefined : String(filterValue(definition))"
              :checked="definition.kind === 'boolean' ? Boolean(filterValue(definition)) : undefined"
              :placeholder="definition.placeholder"
              :disabled="applyingCaptureFilters"
              @input="definition.kind !== 'boolean' && (captureFilters[definition.id] = ($event.target as HTMLInputElement).value)"
              @change="void updateCaptureFilter(definition.id, definition.kind === 'boolean' ? ($event.target as HTMLInputElement).checked : ($event.target as HTMLInputElement).value)"
            />
            <datalist v-if="definition.kind === 'text' && captureFilterOptions[definition.id]?.length" :id="`capture-options-${definition.id}`">
              <option v-for="option in captureFilterOptions[definition.id]" :key="option" :value="option" />
            </datalist>
            <small v-if="definition.description">{{ definition.description }}</small>
          </div>
        </div>
        <div class="filter-section level-filters" :class="{ 'multi-selected': selectedLevels.length > 1 }">
          <span class="filter-label"><IconGlyph name="activity" :size="13" />View filters · Level</span>
          <button class="filter-row level-filter-row level-filter-all" :class="{ active: selectedLevels.length === 0 }" type="button" :aria-pressed="selectedLevels.length === 0" @click="clearLevelSelection">
            <span class="filter-row-label"><IconGlyph name="activity" :size="14" />ALL</span>
          </button>
          <button
            v-for="item in levelOptions"
            :key="item"
            class="filter-row level-filter-row"
            :class="[{ active: selectedLevels.includes(item) }, `level-filter-${item}`]"
            type="button"
            :aria-pressed="selectedLevels.includes(item)"
            @click="handleLevelClick(item, $event)"
          >
            <span class="filter-row-label">
              <IconGlyph :name="levelIcon(item)" :size="14" />{{ item.toUpperCase() }}
            </span>
            <span class="level-checkbox" :class="{ checked: selectedLevels.includes(item) }" role="checkbox" :aria-checked="selectedLevels.includes(item)" tabindex="0" @click.stop="toggleLevelCheckbox(item)">
              <svg v-if="selectedLevels.includes(item)" viewBox="0 0 24 24" class="level-checkbox-icon">
                <path d="m5 12 4.5 4.5L19 7" />
              </svg>
            </span>
          </button>
        </div>
      </aside>

      <section class="log-panel glass">
        <header class="log-panel-header">
          <div class="log-panel-tools">
            <div v-if="activeFilterChips.length" class="filter-summary" aria-label="Active filters">
              <span v-for="chip in activeFilterChips" :key="`${chip.label}-${chip.value}`" class="filter-chip" :class="chip.kind === 'level' ? ['level-chip', `level-chip-${chip.value}`] : undefined">
                <small v-if="chip.label">{{ chip.label }}</small>{{ chip.value }}
              </span>
            </div>
            <span v-if="error" class="transport-error">{{ error }}</span>
          </div>
          <div class="log-actions" aria-label="Log list controls">
            <button
              class="log-action"
              :class="{ active: autoScroll }"
              type="button"
              :aria-label="autoScroll ? 'Disable auto-scroll' : 'Enable auto-scroll'"
              :aria-pressed="autoScroll"
              :title="autoScroll ? 'Disable auto-scroll' : 'Enable auto-scroll'"
              @click="toggleAutoScroll"
            >
              <IconGlyph name="arrow-down" :size="15" />
            </button>
            <button
              class="log-action"
              :class="{ active: compactRows }"
              type="button"
              :aria-label="compactRows ? 'Disable compact rows' : 'Enable compact rows'"
              :aria-pressed="compactRows"
              :title="compactRows ? 'Disable compact rows' : 'Enable compact rows'"
              @click="compactRows = !compactRows"
            >
              <IconGlyph name="rows" :size="15" />
            </button>
          </div>
        </header>
        <div v-if="!filteredLogs.length" class="empty-state">
          <div class="empty-icon"><IconGlyph name="activity" :size="22" /></div>
          <h2>Waiting for logs</h2>
          <p>Received debug sources will appear here.</p>
        </div>
        <VirtualList
          v-else
          ref="logListRef"
          :items="filteredLogs"
          :item-height="compactRows ? 30 : 38"
          :follow="autoScroll"
          :item-key="record => record.id"
          class="log-list"
          :class="{ compact: compactRows }"
          @scroll-state="handleLogListScroll"
        >
          <template #default="{ item: record }">
            <button
              class="log-row"
              :class="{ selected: selectedLogIds.includes(record.id) }"
              type="button"
              @click="selectLog(record, $event)"
              @dblclick="void openRecord(record)"
            >
              <time>{{ new Date(record.timestamp).toLocaleTimeString() }}</time>
              <span class="level-badge" :class="`level-${record.level}`"><IconGlyph :name="levelIcon(record.level)" :size="12" />{{ record.level }}</span>
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
