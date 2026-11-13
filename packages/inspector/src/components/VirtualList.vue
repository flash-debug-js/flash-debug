<script setup lang="ts" generic="T">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

const props = withDefaults(defineProps<{
  items: readonly T[]
  itemHeight: number
  overscan?: number
  itemKey?: (item: T, index: number) => string | number
}>(), {
  overscan: 8,
})

defineSlots<{
  default(props: { item: T, index: number }): unknown
}>()

const viewport = ref<HTMLElement>()
const scrollTop = ref(0)
const viewportHeight = ref(0)
let resizeObserver: ResizeObserver | undefined

const rowHeight = computed(() => Math.max(1, props.itemHeight))
const overscanCount = computed(() => Math.max(0, Math.floor(props.overscan)))
const startIndex = computed(() => Math.min(
  props.items.length,
  Math.max(0, Math.floor(scrollTop.value / rowHeight.value) - overscanCount.value),
))
const endIndex = computed(() => Math.min(
  props.items.length,
  Math.ceil((scrollTop.value + viewportHeight.value) / rowHeight.value) + overscanCount.value,
))
const visibleItems = computed(() => props.items.slice(startIndex.value, endIndex.value))
const contentHeight = computed(() => props.items.length * rowHeight.value)
const contentOffset = computed(() => startIndex.value * rowHeight.value)

function updateViewport(): void {
  viewportHeight.value = viewport.value?.clientHeight ?? 0
  scrollTop.value = viewport.value?.scrollTop ?? 0
}

function handleScroll(event: Event): void {
  scrollTop.value = (event.currentTarget as HTMLElement).scrollTop
}

function itemKey(item: T, index: number): string | number {
  return props.itemKey?.(item, index) ?? index
}

onMounted(() => {
  updateViewport()
  if (typeof ResizeObserver !== 'undefined' && viewport.value) {
    resizeObserver = new ResizeObserver(updateViewport)
    resizeObserver.observe(viewport.value)
  }
})

watch(() => props.items.length, async () => {
  await nextTick()
  if (viewport.value) {
    viewport.value.scrollTop = Math.min(
      viewport.value.scrollTop,
      Math.max(0, contentHeight.value - viewportHeight.value),
    )
  }
  updateViewport()
})

onBeforeUnmount(() => resizeObserver?.disconnect())
</script>

<template>
  <div ref="viewport" class="virtual-list" @scroll="handleScroll">
    <div class="virtual-list-spacer" :style="{ height: `${contentHeight}px` }">
      <div class="virtual-list-window" :style="{ transform: `translateY(${contentOffset}px)` }">
        <div v-for="(item, offset) in visibleItems" :key="itemKey(item, startIndex + offset)" class="virtual-list-item" :style="{ height: `${rowHeight}px` }">
          <slot :item="item" :index="startIndex + offset" />
        </div>
      </div>
    </div>
  </div>
</template>
