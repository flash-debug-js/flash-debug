<script setup lang="ts">
withDefaults(defineProps<{
  open: boolean
  ariaLabel: string
  panelClass?: string
  closeOnBackdrop?: boolean
  persistent?: boolean
}>(), {
  panelClass: '',
  closeOnBackdrop: true,
  persistent: false,
})

const emit = defineEmits<{ close: [] }>()
</script>

<template>
  <Teleport to="body">
    <Transition name="dialog">
      <div v-if="persistent || open" v-show="!persistent || open" class="modal-backdrop dialog-backdrop" @click.self="closeOnBackdrop && emit('close')">
        <section class="dialog-panel" :class="panelClass" role="dialog" aria-modal="true" :aria-label="ariaLabel">
          <slot />
        </section>
      </div>
    </Transition>
  </Teleport>
</template>
