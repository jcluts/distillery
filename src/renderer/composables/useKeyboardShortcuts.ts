import { onBeforeUnmount, onMounted } from 'vue'

import { useGenerationStore } from '@/stores/generation'
import { useLibraryStore } from '@/stores/library'
import { useRemovalStore } from '@/stores/removal'
import { useTransformStore } from '@/stores/transform'
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

function focusPrompt(): void {
  const el = document.querySelector<HTMLElement>('[data-focus-prompt="true"]')
  el?.focus()
}

export function useKeyboardShortcuts(): void {
  const uiStore = useUIStore()
  const libraryStore = useLibraryStore()
  const generationStore = useGenerationStore()
  const transformStore = useTransformStore()
  const removalStore = useRemovalStore()

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
    const isMac = navigator.platform.toLowerCase().includes('mac')
    const modKey = isMac ? event.metaKey : event.ctrlKey

    // Respect text input focus: ignore plain keys while typing, but allow mod-key shortcuts
    if (isTextInputFocused() && !modKey && event.key !== 'Escape') {
      return
    }

    // Tab — toggle left panel
    if (event.key === 'Tab' && !modKey) {
      event.preventDefault()
      uiStore.toggleLeftPanel()
      return
    }

    // Ctrl+K — focus prompt
    if (modKey && event.key.toLowerCase() === 'k') {
      event.preventDefault()
      uiStore.setLeftPanelTab('generation')
      focusPrompt()
      return
    }

    // Ctrl+Enter — submit generation
    if (modKey && event.key === 'Enter') {
      event.preventDefault()
      uiStore.setLeftPanelTab('generation')
      const params = generationStore.buildParams()
      if (params.params.prompt.trim()) {
        void window.api.submitGeneration(params)
      }
      return
    }

    // Ctrl+A — select all
    if (modKey && event.key.toLowerCase() === 'a') {
      event.preventDefault()
      libraryStore.selectAll()
      return
    }

    // Ctrl+Z — undo removal stroke (when in paint mode)
    if (modKey && event.key.toLowerCase() === 'z' && removalStore.paintMode) {
      event.preventDefault()
      removalStore.undoStroke()
      return
    }

    // G — grid view
    if (event.key.toLowerCase() === 'g') {
      uiStore.setViewMode('grid')
      return
    }

    // E or Enter — loupe view
    if (event.key.toLowerCase() === 'e' || event.key === 'Enter') {
      if (!libraryStore.focusedId && libraryStore.items[0]) {
        libraryStore.selectSingle(libraryStore.items[0].id)
      }
      if (libraryStore.focusedId || libraryStore.items.length > 0) {
        uiStore.setViewMode('loupe')
      }
      return
    }

    // Escape — cancel paint mode, cancel crop, or exit loupe
    if (event.key === 'Escape') {
      if (removalStore.paintMode) {
        removalStore.cancelPaintMode()
        return
      }
      if (transformStore.cropMode) {
        transformStore.cancelCrop()
        return
      }
      if (uiStore.viewMode === 'loupe') {
        uiStore.setViewMode('grid')
        return
      }
    }

    // Z or Space — cycle zoom (loupe only, not in crop mode)
    if (uiStore.viewMode === 'loupe') {
      if (
        (event.key.toLowerCase() === 'z' || event.key === ' ') &&
        !transformStore.cropMode
      ) {
        event.preventDefault()
        uiStore.cycleZoom()
        return
      }
    }

    // Arrow keys — navigate
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

    // Culling shortcuts — apply to all selected items (or just focused)
    if (!libraryStore.focusedId && libraryStore.selectedIds.size === 0) {
      return
    }

    const digit = Number(event.key)
    if (Number.isInteger(digit) && digit >= 0 && digit <= 5) {
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
