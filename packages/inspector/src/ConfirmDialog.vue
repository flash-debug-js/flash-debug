<script setup lang="ts">
import { useEscapeClose } from './utils/use-escape-close'
import BaseDialog from './components/BaseDialog.vue'

const props = withDefaults(defineProps<{
  open: boolean
  title?: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
}>(), {
  title: 'Confirm action',
  confirmLabel: 'Confirm',
  cancelLabel: 'Cancel',
})

const emit = defineEmits<{
  confirm: []
  cancel: []
}>()

useEscapeClose(() => props.open, () => emit('cancel'))
</script>

<template>
  <BaseDialog :open="open" :ariaLabel="title" panel-class="confirm-modal" @close="emit('cancel')">
    <div class="confirm-icon" aria-hidden="true">!</div>
    <div class="confirm-content">
      <h2>{{ title }}</h2>
      <p>{{ message }}</p>
    </div>
    <footer class="confirm-actions">
      <button class="confirm-button confirm-button-secondary" type="button" @click="emit('cancel')">{{ cancelLabel }}</button>
      <button class="confirm-button confirm-button-primary" type="button" @click="emit('confirm')">{{ confirmLabel }}</button>
    </footer>
  </BaseDialog>
</template>
