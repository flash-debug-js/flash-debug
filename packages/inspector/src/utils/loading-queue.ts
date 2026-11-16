import { computed, onBeforeUnmount, ref } from 'vue'

export interface LoadingItem {
  id: string
  message: string
}

export function useLoadingQueue(intervalMs = 1800) {
  const items = ref<LoadingItem[]>([])
  const index = ref(0)
  let timer: ReturnType<typeof setInterval> | undefined

  const currentMessage = computed(() => items.value[index.value]?.message ?? '')

  function restartRotation(): void {
    if (timer) {
      clearInterval(timer)
      timer = undefined
    }

    if (items.value.length > 1) {
      timer = setInterval(() => {
        index.value = (index.value + 1) % items.value.length
      }, intervalMs)
    }
  }

  function setLoading(id: string, message: string, active: boolean): void {
    const next = items.value.filter(item => item.id !== id)
    if (active) {
      next.push({ id, message })
    }
    items.value = next
    index.value = next.length
      ? index.value % next.length
      : 0
    restartRotation()
  }

  onBeforeUnmount(() => {
    if (timer) {
      clearInterval(timer)
    }
  })

  return { items, currentMessage, setLoading }
}
