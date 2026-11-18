<script setup lang="ts">
import type { DebugFilterDefinition, DebugLogLevel, DebugLogRecord, DebugSessionSnapshot } from '@flash-debug/types'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import ConfirmDialog from './ConfirmDialog.vue'
import HelpDialog from './HelpDialog.vue'
import LogDetailModal from './LogDetailModal.vue'
import QrDialog from './QrDialog.vue'
import BaseDropdown from './components/BaseDropdown.vue'
import IconGlyph from './components/IconGlyph.vue'
import type { IconName } from './components/IconGlyph.vue'
import VirtualList from './components/VirtualList.vue'
import { useLoadingQueue } from './utils/loading-queue'
import { useLogStream } from './utils/log-stream'
import { usePersistentState } from './utils/persistent-state'
import { mergePastedLogs, parsePastedLogs } from './utils/pasted-logs'
import { useRangeSelection } from './utils/range-selection'
import { useTimedMessage } from './utils/timed-message'
import { createLogWorkerClient } from './worker/log-worker-client'
import type { LogListItem, LogSnapshot } from './worker/log-worker-types'
import { createEmptyLogSnapshot, MAX_LIST_MESSAGE_LENGTH } from './worker/log-worker-types'

type LogViewMode = 'live' | 'pasted'

const logSnapshot = shallowRef<LogSnapshot>(createEmptyLogSnapshot())
const selected = shallowRef<DebugLogRecord | null>(null)
const selectedId = ref<string | null>(null)
const selectedLogIds = ref<string[]>([])
const logViewMode = ref<LogViewMode>('live')
const pastedLogs = ref<DebugLogRecord[]>([])
const query = ref('')
const levelOptions: readonly DebugLogLevel[] = ['debug', 'info', 'warning', 'error']
const selectedLevels = usePersistentState<DebugLogLevel[]>('levels', [])
const source = usePersistentState<'all' | DebugLogRecord['source']>('source', 'all')
const error = ref('')
const applyingCaptureFilters = ref(false)
const autoScroll = usePersistentState('auto-scroll', true)
const compactRows = usePersistentState('compact-rows', false)
const clearLogsDialogOpen = ref(false)
const helpDialogOpen = ref(false)
const qrDialogOpen = ref(false)
const mobileMenuOpen = ref(false)
const currentOrigin = ref('')
const searchInputRef = ref<HTMLInputElement>()
const loadingQueue = useLoadingQueue()
const loadingMessage = loadingQueue.currentMessage
const loadingItems = loadingQueue.items
const loadingMenuOpen = ref(false)
const logListRef = ref<{ scrollToEnd: () => void } | null>(null)
const copyNoticeMessage = useTimedMessage()
const topMessageState = useTimedMessage()
const copyNotice = copyNoticeMessage.message
const topMessage = topMessageState.message
const workerClient = createLogWorkerClient({
  onError: (cause) => {
    error.value = cause instanceof Error ? cause.message : String(cause)
  },
})
const unsubscribeWorker = workerClient.subscribe((snapshot) => {
  logSnapshot.value = snapshot
})
let filterTimer: ReturnType<typeof setTimeout> | undefined
const logStream = useLogStream(workerClient, (cause) => {
  error.value = cause instanceof Error ? cause.message : String(cause)
})
const { captureFilters, connected, session } = logStream
watch(connected, (value) => {
  if (value) {
    error.value = ''
  }
})

const filteredLogs = computed(() => logSnapshot.value.items)
const visiblePastedLogs = computed(() => pastedLogs.value.filter(matchesViewFilter))
const displayLogs = computed<LogListItem[]>(() => logViewMode.value === 'pasted'
  ? visiblePastedLogs.value.map(toListItem)
  : filteredLogs.value)
const displayLogIds = computed(() => displayLogs.value.map(record => record.id))
const levelSelection = useRangeSelection(() => levelOptions, selectedLevels)
const logSelection = useRangeSelection(() => displayLogIds.value, selectedLogIds, { toggleOnRepeatedClick: true })
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

watch(displayLogIds, (ids) => {
  const visible = new Set(ids)
  const next = selectedLogIds.value.filter(id => visible.has(id))
  if (next.length !== selectedLogIds.value.length) {
    selectedLogIds.value = next
  }
})

function toListItem(record: DebugLogRecord): LogListItem {
  return {
    id: record.id,
    timestamp: record.timestamp,
    level: record.level,
    type: record.type,
    message: record.message.length > MAX_LIST_MESSAGE_LENGTH
      ? `${record.message.slice(0, MAX_LIST_MESSAGE_LENGTH)}…`
      : record.message,
    source: record.source,
  }
}

function matchesViewFilter(record: DebugLogRecord): boolean {
  if (selectedLevels.value.length && !selectedLevels.value.includes(record.level)) {
    return false
  }
  if (source.value !== 'all' && source.value !== record.source) {
    return false
  }

  const normalizedQuery = query.value.trim().toLowerCase()
  if (!normalizedQuery) {
    return true
  }

  return [record.message, record.tag, record.deviceId, record.type]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
    .includes(normalizedQuery)
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
  if (filterTimer) {
    clearTimeout(filterTimer)
  }
  const apply = () => {
    void workerClient.setFilter({
      query: nextQuery,
      levels: [...nextLevels],
      source: nextSource,
    }).catch((cause: unknown) => {
      error.value = cause instanceof Error ? cause.message : String(cause)
    })
  }
  filterTimer = setTimeout(apply, 80)
}, { immediate: true })

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

function toggleAutoScroll(): void {
  autoScroll.value = !autoScroll.value
  if (autoScroll.value) {
    void nextTick(() => logListRef.value?.scrollToEnd())
  }
}

function handleLogListScroll(state: { atBottom: boolean, user: boolean }): void {
  if (state.user && logViewMode.value === 'live') {
    autoScroll.value = false
  }
}

function selectLog(item: LogListItem, event: MouseEvent): void {
  logSelection.handleClick(item.id, event)
}

function handleLogClick(item: LogListItem, event: MouseEvent): void {
  selectLog(item, event)
  if (window.matchMedia('(max-width: 620px)').matches) {
    void openRecord(item)
  }
}

function handleLogMiddleClick(item: LogListItem, event: MouseEvent): void {
  if (event.button !== 1) {
    return
  }

  event.preventDefault()
  event.stopPropagation()
  selectLog(item, event)
  void openRecord(item)
}

function openQrDialog(): void {
  qrDialogOpen.value = true
}

function getPastedRecord(id: string): DebugLogRecord | null {
  return pastedLogs.value.find(record => record.id === id) ?? null
}

async function getSelectedRecord(id: string): Promise<DebugLogRecord | null> {
  return logViewMode.value === 'pasted'
    ? getPastedRecord(id)
    : workerClient.getRecord(id)
}

function resetLogSelection(): void {
  logSelection.clear()
  closeRecord()
}

function toggleLogView(): void {
  logViewMode.value = logViewMode.value === 'pasted' ? 'live' : 'pasted'
  resetLogSelection()
  void nextTick(() => logListRef.value?.scrollToEnd())
}

function clearPastedLogs(): void {
  pastedLogs.value = []
  logViewMode.value = 'live'
  resetLogSelection()
}

async function clearCurrentLogs(): Promise<void> {
  const response = await fetch('/api/v1/logs', { method: 'DELETE' })
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`)
  }

  await workerClient.clear()
  resetLogSelection()
}

function openClearLogsDialog(): void {
  if (!logSnapshot.value.total) {
    return
  }
  clearLogsDialogOpen.value = true
}

function cancelClearLogs(): void {
  clearLogsDialogOpen.value = false
}

function confirmClearLogs(): void {
  clearLogsDialogOpen.value = false
  void clearCurrentLogs().catch((cause: unknown) => {
    error.value = cause instanceof Error ? cause.message : String(cause)
  })
}

function isEditableTarget(target: EventTarget | null): boolean {
  const element = target instanceof HTMLElement ? target : null
  return element?.matches('input, textarea, select, [contenteditable="true"]') ?? false
}

function hasNativeTextSelection(): boolean {
  const selection = window.getSelection()
  return Boolean(selection && !selection.isCollapsed && selection.toString())
}

async function writeClipboard(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text)
    return
  }

  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  textarea.select()
  const copied = document.execCommand('copy')
  textarea.remove()
  if (!copied) {
    throw new Error('Clipboard is unavailable')
  }
}

async function copySelectedLogs(): Promise<void> {
  const ids = [...selectedLogIds.value]
  if (!ids.length) {
    return
  }

  try {
    const records = (await Promise.all(ids.map(id => getSelectedRecord(id)))).filter((record): record is DebugLogRecord => record !== null)
    if (!records.length) {
      throw new Error('Selected logs are no longer available')
    }

    const raw = JSON.stringify(records.length === 1 ? records[0] : records, null, 2)
    await writeClipboard(raw)
    copyNoticeMessage.show(records.length === 1 ? 'Copied raw JSON' : `Copied ${records.length} logs as JSON`)
  }
  catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause)
  }
}

async function copyQrUrl(): Promise<void> {
  if (!currentOrigin.value) {
    return
  }

  try {
    await writeClipboard(currentOrigin.value)
    topMessageState.show('URL copied')
  }
  catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause)
  }
}

function handlePaste(event: ClipboardEvent): void {
  if (isEditableTarget(event.target)) {
    return
  }

  const records = parsePastedLogs(event.clipboardData?.getData('text/plain') ?? '')
  if (!records.length) {
    return
  }

  event.preventDefault()
  pastedLogs.value = mergePastedLogs(pastedLogs.value, records)
  logViewMode.value = 'pasted'
  resetLogSelection()
  copyNoticeMessage.show(`Pasted ${records.length} logs`)
  void nextTick(() => logListRef.value?.scrollToEnd())
}

function handleKeydown(event: KeyboardEvent): void {
  const canUseGlobalShortcut = !isEditableTarget(event.target)
    && !event.ctrlKey
    && !event.metaKey
    && !event.altKey
    && !helpDialogOpen.value
    && !clearLogsDialogOpen.value
    && !qrDialogOpen.value

  if (canUseGlobalShortcut && event.key.toLowerCase() === 'q') {
    event.preventDefault()
    openQrDialog()
    return
  }

  if (canUseGlobalShortcut && event.key === '/') {
    event.preventDefault()
    searchInputRef.value?.focus()
    return
  }

  if (event.key.toLowerCase() === 'x' && pastedLogs.value.length && !isEditableTarget(event.target) && !event.ctrlKey && !event.metaKey && !event.altKey && !helpDialogOpen.value && !clearLogsDialogOpen.value && !qrDialogOpen.value) {
    event.preventDefault()
    toggleLogView()
    return
  }

  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'c') {
    if (qrDialogOpen.value) {
      event.preventDefault()
      void copyQrUrl()
      return
    }

    if (selectedLogIds.value.length && !isEditableTarget(event.target) && !hasNativeTextSelection()) {
      event.preventDefault()
      void copySelectedLogs()
    }
    return
  }

  if (!selectedId.value) {
    return
  }

  if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') {
    return
  }

  const records = displayLogs.value
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
    const record = await getSelectedRecord(requestId)
    if (!record) {
      throw new Error('Selected log is no longer available')
    }
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
  currentOrigin.value = window.location.origin
  window.addEventListener('keydown', handleKeydown)
  window.addEventListener('paste', handlePaste)
  logStream.start()
})

onBeforeUnmount(() => {
  if (filterTimer) {
    clearTimeout(filterTimer)
  }
  window.removeEventListener('keydown', handleKeydown)
  window.removeEventListener('paste', handlePaste)
  unsubscribeWorker()
  workerClient.dispose()
})
</script>

<template>
  <main class="app-shell">
    <Transition name="top-message">
      <div v-if="topMessage" class="top-message" role="status" aria-live="polite">
        <IconGlyph name="info" :size="14" />
        <span>{{ topMessage }}</span>
      </div>
    </Transition>
    <header class="topbar glass">
      <nav class="tool-nav" aria-label="Inspector navigation">
        <BaseDropdown :open="mobileMenuOpen" @close="mobileMenuOpen = false">
          <template #trigger>
            <button class="tool-nav-button mobile-menu-trigger" type="button" aria-label="Open menu" title="Open menu" @click="mobileMenuOpen = !mobileMenuOpen"><IconGlyph name="menu" :size="15" /></button>
          </template>
          <div class="mobile-menu-list">
            <button class="mobile-menu-item active" type="button" @click="mobileMenuOpen = false"><IconGlyph name="layers" :size="15" /><span>Logs</span></button>
            <button class="mobile-menu-item" type="button" @click="mobileMenuOpen = false; helpDialogOpen = true"><IconGlyph name="help" :size="15" /><span>Help</span></button>
            <button class="mobile-menu-item" type="button" @click="mobileMenuOpen = false; openQrDialog()"><IconGlyph name="qr" :size="15" /><span>QR code</span></button>
          </div>
        </BaseDropdown>
        <div class="tool-nav-desktop">
          <button class="tool-nav-button" type="button" aria-label="Help" title="Help and shortcuts" @click="helpDialogOpen = true"><IconGlyph name="help" :size="15" /></button>
          <button class="tool-nav-button" type="button" aria-label="Show QR code" title="Open Inspector on another device" @click="openQrDialog"><IconGlyph name="qr" :size="15" /></button>
          <span class="tool-nav-item active"><IconGlyph name="layers" :size="15" />Logs</span>
          <button class="tool-nav-item disabled" type="button" disabled title="Filters are shown in the sidebar"><IconGlyph name="filter" :size="15" />Filters</button>
        </div>
      </nav>
      <label class="search">
        <IconGlyph name="search" :size="15" />
        <input ref="searchInputRef" v-model="query" type="search" placeholder="Search logs" />
        <kbd>/</kbd>
      </label>
      <div class="topbar-right">
        <BaseDropdown v-if="loadingMessage" :open="loadingMenuOpen" align="right" @close="loadingMenuOpen = false">
          <template #trigger>
            <button class="loading-pill" type="button" aria-label="Show loading tasks" :aria-expanded="loadingMenuOpen" @click="loadingMenuOpen = !loadingMenuOpen">
              <span class="loading-spinner loading-pill-spinner" aria-hidden="true" />
              <span class="loading-mobile-label">Loading</span>
              <Transition name="loading-message" mode="out-in">
                <span :key="loadingMessage" class="loading-message">{{ loadingMessage }}</span>
              </Transition>
            </button>
          </template>
          <div class="loading-menu-list">
            <div v-for="item in loadingItems" :key="item.id" class="loading-menu-item">
              <span class="loading-menu-dot" aria-hidden="true" />
              <span>{{ item.message }}</span>
            </div>
          </div>
        </BaseDropdown>
        <div class="header-actions">
          <span
            class="stats"
            :class="{ 'stats-clearable': logSnapshot.total > 0 }"
            :role="logSnapshot.total > 0 ? 'button' : undefined"
            :tabindex="logSnapshot.total > 0 ? 0 : undefined"
            @click="openClearLogsDialog"
            @keydown.enter.space.prevent="openClearLogsDialog"
          >{{ logSnapshot.total }} logs</span>
          <IconGlyph name="activity" :size="14" class="status-signal" :class="{ online: connected }" />
          <span class="stats connection-status" :class="{ online: connected }">{{ connected ? 'Live' : 'Offline' }}</span>
        </div>
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
            <div v-if="pastedLogs.length" class="log-view-tag" :class="{ active: logViewMode === 'pasted' }">
              <span class="log-view-tag-label">Pasted logs · {{ pastedLogs.length }}</span>
              <span class="log-view-tag-actions">
                <button
                  class="log-view-tag-button"
                  type="button"
                  :aria-label="logViewMode === 'pasted' ? 'Switch to listening logs' : 'Switch to pasted logs'"
                  :title="logViewMode === 'pasted' ? 'Switch to listening logs' : 'Switch to pasted logs'"
                  @click="toggleLogView"
                >
                  <IconGlyph name="switch" :size="13" />
                </button>
                <button class="log-view-tag-button" type="button" aria-label="Close pasted logs" title="Close pasted logs" @click="clearPastedLogs">
                  <IconGlyph name="close" :size="13" />
                </button>
              </span>
            </div>
            <div v-if="activeFilterChips.length" class="filter-summary" aria-label="Active filters">
              <span v-for="chip in activeFilterChips" :key="`${chip.label}-${chip.value}`" class="filter-chip" :class="chip.kind === 'level' ? ['level-chip', `level-chip-${chip.value}`] : undefined">
                <small v-if="chip.label">{{ chip.label }}</small>{{ chip.value }}
              </span>
            </div>
            <span v-if="copyNotice" class="copy-notice">{{ copyNotice }}</span>
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
        <div v-if="!displayLogs.length" class="empty-state">
          <div class="empty-icon"><IconGlyph name="activity" :size="22" /></div>
          <h2>{{ logViewMode === 'pasted' ? 'No pasted logs' : 'Waiting for logs' }}</h2>
          <p>{{ logViewMode === 'pasted' ? 'Paste raw log JSON to inspect it here.' : 'Received debug sources will appear here.' }}</p>
        </div>
        <VirtualList
          v-else
          ref="logListRef"
          :items="displayLogs"
          :item-height="compactRows ? 30 : 38"
          :follow="logViewMode === 'live' && autoScroll"
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
              @click="handleLogClick(record, $event)"
              @dblclick="void openRecord(record)"
              @mousedown="handleLogMiddleClick(record, $event)"
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

    <LogDetailModal :record="selected" @close="closeRecord" @loading="loadingQueue.setLoading('monaco', 'Loading Monaco…', $event)" />
    <HelpDialog :open="helpDialogOpen" @close="helpDialogOpen = false" />
    <QrDialog :open="qrDialogOpen" :value="currentOrigin" @close="qrDialogOpen = false" />
    <ConfirmDialog
      :open="clearLogsDialogOpen"
      title="Clear current logs?"
      :message="`This will clear ${logSnapshot.total} logs from the current Inspector view.`"
      confirm-label="Clear logs"
      @cancel="cancelClearLogs"
      @confirm="confirmClearLogs"
    />
  </main>
</template>
