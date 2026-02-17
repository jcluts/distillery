import * as React from 'react'
import { useLibraryStore } from '@/stores/library-store'

interface MediaItemHandlers {
  handleClick: (e: React.MouseEvent, id: string) => void
  handleDragStart: (e: React.DragEvent, id: string) => void
  selectionClasses: (id: string) => Record<string, boolean>
}

export function useMediaItemHandlers(): MediaItemHandlers {
  const selectedIds = useLibraryStore((s) => s.selectedIds)
  const focusedId = useLibraryStore((s) => s.focusedId)
  const selectSingle = useLibraryStore((s) => s.selectSingle)
  const toggleSelect = useLibraryStore((s) => s.toggleSelect)
  const rangeSelect = useLibraryStore((s) => s.rangeSelect)

  const handleClick = React.useCallback(
    (e: React.MouseEvent, id: string) => {
      if (e.ctrlKey || e.metaKey) {
        toggleSelect(id)
      } else if (e.shiftKey) {
        rangeSelect(id)
      } else {
        selectSingle(id)
      }
    },
    [toggleSelect, rangeSelect, selectSingle]
  )

  const handleDragStart = React.useCallback(
    (e: React.DragEvent, id: string) => {
      if (selectedIds.has(id) && selectedIds.size > 1) {
        const ids = JSON.stringify([...selectedIds])
        e.dataTransfer.setData('application/x-distillery-media-ids', ids)
      }
      e.dataTransfer.setData('application/x-distillery-media-id', id)
      e.dataTransfer.setData('text/plain', id)
    },
    [selectedIds]
  )

  const selectionClasses = React.useCallback(
    (id: string): Record<string, boolean> => {
      const isSelected = selectedIds.has(id)
      const isFocused = id === focusedId
      return {
        'ring-2 ring-ring': isSelected && !isFocused,
        'ring-2 ring-primary': isFocused
      }
    },
    [selectedIds, focusedId]
  )

  return { handleClick, handleDragStart, selectionClasses }
}
