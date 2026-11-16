import { describe, expect, it } from 'vitest'
import { ref } from 'vue'
import { useRangeSelection } from './range-selection'

function mouseEvent(options: Partial<Pick<MouseEvent, 'ctrlKey' | 'metaKey' | 'shiftKey'>> = {}): MouseEvent {
  return {
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    ...options,
  } as MouseEvent
}

describe('useRangeSelection', () => {
  it('replaces selection on a normal click', () => {
    const selected = ref<string[]>([])
    const selection = useRangeSelection(() => ['a', 'b', 'c'], selected)

    selection.handleClick('b', mouseEvent())
    expect(selected.value).toEqual(['b'])
  })

  it('toggles values with Ctrl or Command', () => {
    const selected = ref<string[]>([])
    const selection = useRangeSelection(() => ['a', 'b', 'c'], selected)

    selection.handleClick('a', mouseEvent())
    selection.handleClick('c', mouseEvent({ ctrlKey: true }))
    selection.handleClick('a', mouseEvent({ ctrlKey: true }))
    expect(selected.value).toEqual(['c'])
  })

  it('selects the range from the previous anchor with Shift', () => {
    const selected = ref<string[]>([])
    const selection = useRangeSelection(() => ['a', 'b', 'c', 'd'], selected)

    selection.handleClick('b', mouseEvent())
    selection.handleClick('d', mouseEvent({ shiftKey: true }))
    expect(selected.value).toEqual(['b', 'c', 'd'])
  })

  it('clears a single selection when the same value is clicked again', () => {
    const selected = ref<string[]>([])
    const selection = useRangeSelection(() => ['a', 'b', 'c'], selected, { toggleOnRepeatedClick: true })

    selection.handleClick('b', mouseEvent())
    selection.handleClick('b', mouseEvent())
    expect(selected.value).toEqual([])
  })
})
