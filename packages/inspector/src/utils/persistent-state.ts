import type { Ref } from 'vue'
import { ref, watch } from 'vue'

const STORAGE_PREFIX = 'flash-debug.inspector.'

function readValue<T>(key: string, fallback: T): T {
  if (typeof localStorage === 'undefined') {
    return fallback
  }

  try {
    const stored = localStorage.getItem(`${STORAGE_PREFIX}${key}`)
    return stored === null
      ? fallback
      : JSON.parse(stored) as T
  }
  catch {
    return fallback
  }
}

function writeValue<T>(key: string, value: T): void {
  if (typeof localStorage === 'undefined') {
    return
  }

  try {
    localStorage.setItem(`${STORAGE_PREFIX}${key}`, JSON.stringify(value))
  }
  catch {
    // Storage can be unavailable or full. The in-memory state remains usable.
  }
}

export function usePersistentState<T>(key: string, fallback: T): Ref<T> {
  const state = ref(readValue(key, fallback)) as Ref<T>
  watch(state, value => writeValue(key, value), { deep: true })
  return state
}
