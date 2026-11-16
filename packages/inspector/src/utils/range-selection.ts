import type { Ref } from 'vue'
import { shallowRef } from 'vue'

export interface RangeSelection<T> {
  anchor: Ref<T | null>
  handleClick: (value: T, event: MouseEvent) => void
  toggle: (value: T) => void
  clear: () => void
}

function orderedUnique<T>(items: readonly T[], values: readonly T[]): T[] {
  const selected = new Set(values)
  return items.filter(item => selected.has(item))
}

/**
 * Reusable single, Ctrl/Cmd additive, and Shift range selection behavior.
 * The anchor is stored by value so filtering or list updates do not move it
 * to an unrelated row.
 */
export function useRangeSelection<T>(items: () => readonly T[], selection: Ref<T[]>): RangeSelection<T> {
  const anchor = shallowRef<T | null>(null)

  function toggle(value: T): void {
    const currentItems = items()
    const next = selection.value.includes(value)
      ? selection.value.filter(item => item !== value)
      : [...selection.value, value]
    selection.value = orderedUnique(currentItems, next)
    anchor.value = value
  }

  function handleClick(value: T, event: MouseEvent): void {
    const currentItems = items()
    const index = currentItems.indexOf(value)
    if (index < 0) {
      return
    }

    const additive = event.ctrlKey || event.metaKey
    const anchorIndex = anchor.value === null ? -1 : currentItems.indexOf(anchor.value)
    if (event.shiftKey && anchorIndex >= 0) {
      const start = Math.min(anchorIndex, index)
      const end = Math.max(anchorIndex, index)
      const range = currentItems.slice(start, end + 1)
      selection.value = additive
        ? orderedUnique(currentItems, [...selection.value, ...range])
        : [...range]
    }
    else if (additive) {
      toggle(value)
      return
    }
    else {
      selection.value = [value]
    }

    anchor.value = value
  }

  function clear(): void {
    selection.value = []
    anchor.value = null
  }

  return { anchor, handleClick, toggle, clear }
}
