<script setup lang="ts">
import type { DebugLogRecord } from '@flash-debug/types'
import { onBeforeUnmount, ref, watch } from 'vue'
import { contentFor, detectContentFormat, formattedContent, languageFor } from './content-format'
import { INSPECTOR_EDITOR_OPTIONS, INSPECTOR_EDITOR_THEME } from './editor-config'
import vitesseDark from '@shikijs/themes/vitesse-dark'
import jsonLang from '@shikijs/langs/json'
import jsoncLang from '@shikijs/langs/jsonc'
import jsonlLang from '@shikijs/langs/jsonl'
import yamlLang from '@shikijs/langs/yaml'

const props = defineProps<{ record: DebugLogRecord | null }>()
const emit = defineEmits<{ close: [] }>()
const editorHost = ref<HTMLElement>()
const editor = ref<{ dispose: () => void }>()
const model = ref<{ dispose: () => void, setValue: (value: string) => void }>()
let monaco: Awaited<ReturnType<typeof import('modern-monaco').init>> | undefined

async function ensureEditor(): Promise<void> {
  if (monaco || !editorHost.value) {
    return
  }

  const { init } = await import('modern-monaco')
  monaco = await init({
    defaultTheme: vitesseDark,
    themes: [vitesseDark],
    langs: [jsonLang, jsoncLang, jsonlLang, yamlLang]
  })
  editor.value = monaco.editor.create(editorHost.value, {
    ...INSPECTOR_EDITOR_OPTIONS,
    theme: INSPECTOR_EDITOR_THEME,
    language: 'text',
    value: ''
  })
}

async function renderRecord(record: DebugLogRecord | null): Promise<void> {
  if (!record) {
    return
  }

  await ensureEditor()
  if (!monaco || !editor.value) {
    return
  }

  const format = detectContentFormat(record)
  const language = languageFor(format)
  const value = formattedContent(record)
  const currentModel = model.value

  if (!currentModel) {
    const created = monaco.editor.createModel(value, language)
    model.value = created
    ;(editor.value as { setModel?: (model: unknown) => void }).setModel?.(created)
    return
  }

  currentModel.setValue(value)
  monaco.editor.setModelLanguage(currentModel as never, language)
}

watch(() => props.record, record => {
  void renderRecord(record)
}, { immediate: true })

onBeforeUnmount(() => {
  model.value?.dispose()
  editor.value?.dispose()
})

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

      <div ref="editorHost" class="detail-editor" />

      <footer class="detail-footer">
        <span>{{ contentFor(record).length.toLocaleString() }} characters</span>
        <button type="button" class="copy-button" @click="copyContent">Copy content</button>
      </footer>
    </section>
  </div>
</template>
