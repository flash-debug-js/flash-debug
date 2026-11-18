import { onBeforeUnmount, ref } from 'vue'

export function useTimedMessage(durationMs = 1800) {
  const message = ref('')
  let timer: ReturnType<typeof setTimeout> | undefined

  function clear(): void {
    if (timer) {
      clearTimeout(timer)
      timer = undefined
    }
    message.value = ''
  }

  function show(value: string): void {
    if (timer) {
      clearTimeout(timer)
    }
    message.value = value
    timer = setTimeout(() => {
      message.value = ''
      timer = undefined
    }, durationMs)
  }

  onBeforeUnmount(clear)

  return { message, show, clear }
}
