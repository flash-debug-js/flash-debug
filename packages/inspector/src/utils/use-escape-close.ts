import { onBeforeUnmount, onMounted } from 'vue'

export function useEscapeClose(isOpen: () => boolean, close: () => void): void {
  function handleKeydown(event: KeyboardEvent): void {
    if (!isOpen() || event.key !== 'Escape') {
      return
    }

    event.preventDefault()
    close()
  }

  onMounted(() => window.addEventListener('keydown', handleKeydown))
  onBeforeUnmount(() => window.removeEventListener('keydown', handleKeydown))
}
