<script setup lang="ts">
import { useEscapeClose } from './utils/use-escape-close'
import BaseDialog from './components/BaseDialog.vue'
import IconGlyph from './components/IconGlyph.vue'
import { HELP_SHORTCUTS } from './help-shortcuts'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: [] }>()

useEscapeClose(() => props.open, () => emit('close'))
</script>

<template>
  <BaseDialog :open="open" ariaLabel="Inspector help" panel-class="help-modal" @close="emit('close')">
    <header class="help-header">
      <div class="help-heading">
        <span class="help-mark"><IconGlyph name="help" :size="17" /></span>
        <div>
          <h2>Inspector help</h2>
          <p>Inspect live logs, compare pasted logs, and open any event in full detail.</p>
        </div>
      </div>
      <button class="icon-button" type="button" aria-label="Close help" @click="emit('close')">×</button>
    </header>

    <div class="help-body">
      <section class="help-section">
        <h3>Log views</h3>
        <p><strong>Listening logs</strong> are received from connected sources in real time. Copy JSON from selected rows and paste it back into the page to open a separate <strong>Pasted logs</strong> view.</p>
        <p>The pasted view keeps its own list and sorts events by their timestamps, so older events stay above newer events.</p>
      </section>

      <section class="help-section">
        <h3>Shortcuts</h3>
        <div class="shortcut-list">
          <div v-for="shortcut in HELP_SHORTCUTS" :key="shortcut.label" class="shortcut-row">
            <span>{{ shortcut.label }}</span>
            <span class="shortcut-keys">
              <template v-for="(key, keyIndex) in shortcut.keys" :key="`${shortcut.label}-${key}`">
                <span v-if="keyIndex" class="shortcut-plus">+</span>
                <kbd>{{ key }}</kbd>
              </template>
              <template v-for="(alternative, alternativeIndex) in shortcut.alternatives ?? []" :key="`${shortcut.label}-alternative-${alternativeIndex}`">
                <span class="shortcut-or">or</span>
                <template v-for="(key, keyIndex) in alternative" :key="`${shortcut.label}-alternative-${alternativeIndex}-${key}`">
                  <span v-if="keyIndex" class="shortcut-plus">+</span>
                  <kbd>{{ key }}</kbd>
                </template>
              </template>
            </span>
          </div>
        </div>
      </section>
    </div>
  </BaseDialog>
</template>
