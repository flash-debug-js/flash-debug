<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useEscapeClose } from '../utils/use-escape-close'

withDefaults(defineProps<{
  open: boolean
  align?: 'left' | 'right'
}>(), {
  align: 'left',
})

const emit = defineEmits<{ close: [] }>()
const root = ref<HTMLElement>()

useEscapeClose(() => Boolean(root.value?.querySelector('.dropdown-panel')), () => emit('close'))

function handlePointerdown(event: PointerEvent): void {
  if (root.value && !root.value.contains(event.target as Node)) {
    emit('close')
  }
}

onMounted(() => document.addEventListener('pointerdown', handlePointerdown))
onBeforeUnmount(() => document.removeEventListener('pointerdown', handlePointerdown))
</script>

<template>
  <div ref="root" class="dropdown-root">
    <slot name="trigger" />
    <div v-if="open" class="dropdown-panel" :class="`dropdown-panel-${align}`">
      <slot />
    </div>
  </div>
</template>
