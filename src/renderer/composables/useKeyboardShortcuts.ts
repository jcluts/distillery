import { onBeforeUnmount, onMounted } from 'vue'

import { useLibraryStore } from '@/stores/library'
import { useUIStore } from '@/stores/ui'

function isTextInputFocused(): boolean {
  const active = document.activeElement as HTMLElement | null
  if (!active) return false

  const tagName = active.tagName.toLowerCase()
  if (tagName === 'input' || tagName === 'textarea' || tagName === 'select') {
    return true
  }

  return active.isContentEditable
}

export function useKeyboardShortcuts(): void {
  const uiStore = useUIStore()
  const libraryStore = useLibraryStore()

  function updateSelectedMedia(updates: {
    rating?: number
    status?: 'selected' | 'rejected' | null
  }): void {
    const ids =
      libraryStore.selectedIds.size > 0
        ? [...libraryStore.selectedIds]
        : libraryStore.focusedId
          ? [libraryStore.focusedId]
          : []

    for (const id of ids) {
      libraryStore.updateLocalItem(id, updates)
      void window.api.updateMedia(id, updates)
    }
  }

  function onKeyDown(event: KeyboardEvent): void {
    if (isTextInputFocused() && event.key !== 'Escape') {
      return
    }

    if (event.key === 'Tab') {
      event.preventDefault()
      uiStore.toggleLeftPanel()
      return
    }

    if (event.key.toLowerCase() === 'g') {
      uiStore.setViewMode('grid')
      return
    }

    if (event.key.toLowerCase() === 'e' || event.key === 'Enter') {
      if (!libraryStore.focusedId && libraryStore.items[0]) {
        libraryStore.selectSingle(libraryStore.items[0].id)
      }

      if (libraryStore.focusedId || libraryStore.items.length > 0) {
        uiStore.setViewMode('loupe')
      }
      return
    }

    if (event.key === 'Escape' && uiStore.viewMode === 'loupe') {
      uiStore.setViewMode('grid')
      return
    }

    if (event.key === 'ArrowLeft') {
      event.preventDefault()
      libraryStore.focusRelative(-1)
      return
    }

    if (event.key === 'ArrowRight') {
      event.preventDefault()
      libraryStore.focusRelative(1)
      return
    }

    if (!libraryStore.focusedId && libraryStore.selectedIds.size === 0) {
      return
    }

    const digit = Number(event.key)
    if (Number.isInteger(digit) && digit >= 1 && digit <= 5) {
      updateSelectedMedia({ rating: digit })
      return
    }

    if (event.key.toLowerCase() === 'p') {
      updateSelectedMedia({ status: 'selected' })
      return
    }

    if (event.key.toLowerCase() === 'x') {
      updateSelectedMedia({ status: 'rejected' })
      return
    }

    if (event.key.toLowerCase() === 'u') {
      updateSelectedMedia({ status: null })
    }
  }

  onMounted(() => {
    window.addEventListener('keydown', onKeyDown)
  })

  onBeforeUnmount(() => {
    window.removeEventListener('keydown', onKeyDown)
  })
}
