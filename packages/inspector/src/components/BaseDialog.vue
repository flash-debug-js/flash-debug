<script setup lang="ts">
withDefaults(defineProps<{
  open: boolean
  ariaLabel: string
  panelClass?: string
  closeOnBackdrop?: boolean
}>(), {
  panelClass: '',
  closeOnBackdrop: true,
})

const emit = defineEmits<{ close: [] }>()
</script>

<template>
  <Teleport to="body">
    <Transition name="dialog">
      <div v-if="open" class="modal-backdrop dialog-backdrop" @click.self="closeOnBackdrop && emit('close')">
        <section class="dialog-panel" :class="panelClass" role="dialog" aria-modal="true" :aria-label="ariaLabel">
          <slot />
        </section>
      </div>
    </Transition>
  </Teleport>
</template>
