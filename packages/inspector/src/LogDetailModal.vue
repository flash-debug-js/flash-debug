<script setup lang="ts">
import type { DebugLogRecord } from '@flash-debug/types'
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { contentFor, detectContentFormat, formattedContent, languageFor } from './content-format'
import BaseDialog from './components/BaseDialog.vue'
import { useEscapeClose } from './utils/use-escape-close'

const props = defineProps<{ record: DebugLogRecord | null }>()
const emit = defineEmits<{ close: [], loading: [active: boolean] }>()
const editorFrame = ref<HTMLIFrameElement>()
const editorError = ref('')
const editorReady = ref(false)
const editorLoading = ref(false)
const hasOpened = ref(false)
let preloadTimer: ReturnType<typeof setTimeout> | undefined

useEscapeClose(() => props.record !== null, () => emit('close'))

function sendContent(): void {
  const record = props.record
  const frame = editorFrame.value
  if (!record || !frame?.contentWindow) {
    return
  }

  const format = detectContentFormat(record)
  frame.contentWindow.postMessage({
    source: 'flash-debug-inspector',
    type: 'set-content',
    content: formattedContent(record),
    language: languageFor(format),
  }, window.location.origin)
}

function handleFrameMessage(event: MessageEvent): void {
  if (event.origin !== window.location.origin || event.source !== editorFrame.value?.contentWindow || event.data?.source !== 'flash-debug-monaco') {
    return
  }

  if (event.data.type === 'ready') {
    editorReady.value = true
    editorLoading.value = false
    editorError.value = ''
    emit('loading', false)
    sendContent()
  }
  else if (event.data.type === 'error') {
    editorLoading.value = false
    emit('loading', false)
    editorError.value = typeof event.data.message === 'string' ? event.data.message : 'Monaco failed to load'
  }
}

async function startEditorLoading(): Promise<void> {
  if (editorLoading.value || editorReady.value) {
    return
  }

  hasOpened.value = true
  editorLoading.value = true
  emit('loading', true)
  await nextTick()
  sendContent()
}

function retryEditor(): void {
  editorReady.value = false
  editorError.value = ''
  hasOpened.value = false
  void nextTick(() => {
    void startEditorLoading()
  })
}

watch(() => props.record, (record) => {
  if (!record) {
    if (editorError.value) {
      hasOpened.value = false
      editorReady.value = false
    }
    editorError.value = ''
    return
  }

  editorError.value = ''

  if (editorReady.value) {
    sendContent()
  }
  else {
    void startEditorLoading()
  }
}, { immediate: true, flush: 'post' })

onMounted(() => {
  window.addEventListener('message', handleFrameMessage)
  preloadTimer = setTimeout(() => {
    void startEditorLoading()
  }, 800)
})

onBeforeUnmount(() => {
  window.removeEventListener('message', handleFrameMessage)
  if (preloadTimer) {
    clearTimeout(preloadTimer)
  }
})

function copyContent(): void {
  if (props.record) {
    void navigator.clipboard?.writeText(contentFor(props.record))
  }
}
</script>

<template>
  <BaseDialog :open="!!record" :persistent="true" ariaLabel="Log details" panel-class="detail-modal" @close="emit('close')">
    <template v-if="record">
      <header class="detail-header">
        <div class="detail-title">
          <span class="level-badge" :class="`level-${record.level}`">{{ record.level }}</span>
          <strong>{{ record.type }}</strong>
          <span>{{ record.source }}</span>
          <span v-if="record.tag">{{ record.tag }}</span>
        </div>
        <button class="icon-button" type="button" aria-label="Close" @click="emit('close')">×</button>
      </header>

      <dl class="detail-meta">
        <div><dt>Time</dt><dd>{{ record.timestamp }}</dd></div>
        <div v-if="record.deviceId"><dt>Device</dt><dd>{{ record.deviceId }}</dd></div>
        <div><dt>Format</dt><dd>{{ detectContentFormat(record) }}</dd></div>
        <div><dt>Event</dt><dd>{{ record.id }}</dd></div>
      </dl>
    </template>

      <div class="detail-editor">
        <pre v-if="record" class="detail-fallback" :class="{ 'is-hidden': editorReady }">{{ formattedContent(record) }}</pre>
        <div v-if="editorError" class="editor-error">
          <span>Unable to load Monaco: {{ editorError }}</span>
          <button type="button" class="copy-button" @click="retryEditor">Retry</button>
        </div>
        <iframe v-if="hasOpened" ref="editorFrame" class="detail-editor-frame" :class="{ 'is-hidden': !editorReady || !!editorError }" src="/monaco.html" title="Read only log editor" @load="sendContent" />
      </div>

      <footer v-if="record" class="detail-footer">
        <span>{{ contentFor(record).length.toLocaleString() }} characters</span>
        <button type="button" class="copy-button" @click="copyContent">Copy content</button>
      </footer>
  </BaseDialog>
</template>
