import * as React from 'react'

import { useGenerationStore } from '@/stores/generation-store'
import { useLibraryStore } from '@/stores/library-store'
import { useUIStore } from '@/stores/ui-store'

function isTextInputFocused(): boolean {
  const el = document.activeElement as HTMLElement | null
  if (!el) return false
  const tag = el.tagName.toLowerCase()
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return true
  return el.isContentEditable
}

function focusPrompt(): void {
  const el = document.querySelector<HTMLElement>('[data-focus-prompt="true"]')
  el?.focus()
}

export function useKeyboardShortcuts(): void {
  const setViewMode = useUIStore((s) => s.setViewMode)
  const toggleLeftPanel = useUIStore((s) => s.toggleLeftPanel)
  const viewMode = useUIStore((s) => s.viewMode)
  const cycleZoom = useUIStore((s) => s.cycleZoom)

  const items = useLibraryStore((s) => s.items)
  const focusedId = useLibraryStore((s) => s.focusedId)
  const selectedIds = useLibraryStore((s) => s.selectedIds)
  const selectSingle = useLibraryStore((s) => s.selectSingle)
  const selectAll = useLibraryStore((s) => s.selectAll)
  const updateItem = useLibraryStore((s) => s.updateItem)

  const setLeftPanelTab = useUIStore((s) => s.setLeftPanelTab)
  const buildParams = useGenerationStore((s) => s.buildParams)

  React.useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      const isMac = navigator.platform.toLowerCase().includes('mac')
      const modKey = isMac ? e.metaKey : e.ctrlKey

      // Respect text input focus: ignore plain keys while typing.
      if (isTextInputFocused() && !modKey && e.key !== 'Escape') {
        return
      }

      // Panels
      if (e.key === 'Tab' && !modKey) {
        e.preventDefault()
        toggleLeftPanel()
        return
      }

      // Focus prompt
      if (modKey && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setLeftPanelTab('generation')
        focusPrompt()
        return
      }

      // Generate (mock)
      if (modKey && e.key === 'Enter') {
        e.preventDefault()
        setLeftPanelTab('generation')
        const params = buildParams()
        if (params.params.prompt.trim()) {
          void window.api.submitGeneration(params)
        }
        return
      }

      // Select all
      if (modKey && e.key.toLowerCase() === 'a') {
        e.preventDefault()
        selectAll()
        return
      }

      // View navigation
      if (e.key.toLowerCase() === 'g') {
        setViewMode('grid')
        return
      }

      if (e.key.toLowerCase() === 'e') {
        if (focusedId || items.length > 0) {
          if (!focusedId && items[0]) selectSingle(items[0].id)
          setViewMode('loupe')
        }
        return
      }

      if (e.key === 'Enter') {
        if (focusedId || items.length > 0) {
          if (!focusedId && items[0]) selectSingle(items[0].id)
          setViewMode('loupe')
        }
        return
      }

      if (e.key === 'Escape') {
        if (viewMode === 'loupe') {
          setViewMode('grid')
          return
        }
      }

      if (viewMode === 'loupe') {
        if (e.key.toLowerCase() === 'z') {
          cycleZoom()
          return
        }
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
          e.preventDefault()
          const currentIndex = focusedId
            ? items.findIndex((m) => m.id === focusedId)
            : -1
          if (currentIndex === -1) return
          const nextIndex =
            e.key === 'ArrowLeft' ? currentIndex - 1 : currentIndex + 1
          const next = items[nextIndex]
          if (next) selectSingle(next.id)
        }
        return
      }

      // Grid selection navigation (simple linear prev/next for prototype)
      if (viewMode === 'grid') {
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
          e.preventDefault()
          const currentIndex = focusedId
            ? items.findIndex((m) => m.id === focusedId)
            : -1
          const baseIndex = currentIndex === -1 ? 0 : currentIndex
          const nextIndex =
            e.key === 'ArrowLeft' ? baseIndex - 1 : baseIndex + 1
          const next = items[nextIndex]
          if (next) selectSingle(next.id)
          return
        }
      }

      // Culling shortcuts — apply to all selected items (or just focused)
      if (!focusedId) return
      const targetIds = selectedIds.size > 0 ? [...selectedIds] : [focusedId]
      const digit = Number(e.key)
      if (digit >= 1 && digit <= 5) {
        for (const id of targetIds) {
          updateItem(id, { rating: digit })
          void window.api.updateMedia(id, { rating: digit })
        }
        return
      }
      if (e.key.toLowerCase() === 'p') {
        for (const id of targetIds) {
          updateItem(id, { status: 'selected' })
          void window.api.updateMedia(id, { status: 'selected' })
        }
        return
      }
      if (e.key.toLowerCase() === 'x') {
        for (const id of targetIds) {
          updateItem(id, { status: 'rejected' })
          void window.api.updateMedia(id, { status: 'rejected' })
        }
        return
      }
      if (e.key.toLowerCase() === 'u') {
        for (const id of targetIds) {
          updateItem(id, { status: null })
          void window.api.updateMedia(id, { status: null })
        }
        return
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [
    buildParams,
    cycleZoom,
    focusedId,
    items,
    selectAll,
    selectSingle,
    selectedIds,
    setLeftPanelTab,
    setViewMode,
    toggleLeftPanel,
    updateItem,
    viewMode
  ])
}
