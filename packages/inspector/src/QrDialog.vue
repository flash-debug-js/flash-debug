<script setup lang="ts">
import QRCode from 'qrcode'
import { nextTick, ref, watch } from 'vue'
import BaseDialog from './components/BaseDialog.vue'
import IconGlyph from './components/IconGlyph.vue'
import { useEscapeClose } from './utils/use-escape-close'

const props = defineProps<{
  open: boolean
  value: string
}>()
const emit = defineEmits<{ close: [] }>()
const dataUrl = ref('')
const error = ref('')

useEscapeClose(() => props.open, () => emit('close'))

async function renderQr(): Promise<void> {
  if (!props.open || !props.value) {
    dataUrl.value = ''
    return
  }

  error.value = ''
  await nextTick()
  try {
    dataUrl.value = await QRCode.toDataURL(props.value, {
      width: 240,
      margin: 2,
      errorCorrectionLevel: 'M',
      color: {
        dark: '#111319',
        light: '#ffffff',
      },
    })
  }
  catch (cause) {
    dataUrl.value = ''
    error.value = cause instanceof Error ? cause.message : String(cause)
  }
}

watch(() => [props.open, props.value] as const, () => void renderQr(), { immediate: true })
</script>

<template>
  <BaseDialog :open="open" ariaLabel="Inspector QR code" panel-class="qr-modal" @close="emit('close')">
    <header class="qr-header">
      <div class="qr-heading">
        <span class="qr-mark"><IconGlyph name="qr" :size="17" /></span>
        <div>
          <h2>Open Inspector</h2>
          <p>Scan this code on your phone to open the current Inspector address.</p>
        </div>
      </div>
      <button class="icon-button" type="button" aria-label="Close QR code" @click="emit('close')">×</button>
    </header>

    <div class="qr-body">
      <div v-if="dataUrl" class="qr-frame">
        <img :src="dataUrl" alt="Inspector QR code" />
      </div>
      <div v-else class="qr-error">{{ error || 'Generating QR code…' }}</div>
      <code class="qr-value">{{ value }}</code>
    </div>
  </BaseDialog>
</template>
