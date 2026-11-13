<script setup lang="ts">
import type { DebugLogRecord } from '@flash-debug/types'
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { contentFor, detectContentFormat, formattedContent, languageFor } from './content-format'

const props = defineProps<{ record: DebugLogRecord | null }>()
const emit = defineEmits<{ close: [] }>()
const editorFrame = ref<HTMLIFrameElement>()
const editorError = ref('')
const editorReady = ref(false)
const editorLoading = ref(false)

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
    sendContent()
  }
  else if (event.data.type === 'error') {
    editorLoading.value = false
    editorError.value = typeof event.data.message === 'string' ? event.data.message : 'Monaco failed to load'
  }
}

async function loadEditor(): Promise<void> {
  if (!props.record || editorLoading.value || editorReady.value) {
    return
  }

  editorLoading.value = true
  await nextTick()
  sendContent()
}

watch(() => props.record, () => {
  editorError.value = ''
  editorReady.value = false
  editorLoading.value = false
  void loadEditor()
}, { immediate: true, flush: 'post' })

onMounted(() => window.addEventListener('message', handleFrameMessage))

onBeforeUnmount(() => window.removeEventListener('message', handleFrameMessage))

function copyContent(): void {
  if (props.record) {
    void navigator.clipboard?.writeText(contentFor(props.record))
  }
}
</script>

<template>
  <div v-if="record" class="modal-backdrop" @click.self="emit('close')">
    <section class="detail-modal" role="dialog" aria-modal="true" aria-label="Log details">
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

      <div class="detail-editor">
        <div v-if="editorLoading && !editorError" class="editor-loading" role="status" aria-live="polite">
          <span class="loading-spinner" aria-hidden="true" />
          <span>Loading Monaco…</span>
        </div>
        <div v-if="editorError" class="editor-error">Unable to load Monaco: {{ editorError }}</div>
        <iframe v-if="!editorError" :key="record.id" ref="editorFrame" class="detail-editor-frame" :class="{ 'is-hidden': !editorReady }" src="/monaco.html" title="Read only log editor" @load="sendContent" />
      </div>

      <footer class="detail-footer">
        <span>{{ contentFor(record).length.toLocaleString() }} characters</span>
        <button type="button" class="copy-button" @click="copyContent">Copy content</button>
      </footer>
    </section>
  </div>
</template>
