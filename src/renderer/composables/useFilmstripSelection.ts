import { useGridSelection } from '@/composables/useGridSelection'
import { useLibraryStore } from '@/stores/library'

export function useFilmstripSelection(): {
  handleClick: (event: MouseEvent, id: string) => void
  handleDragStart: (event: DragEvent, id: string) => void
} {
  const libraryStore = useLibraryStore()
  const { handleClick } = useGridSelection()

  function handleDragStart(event: DragEvent, id: string): void {
    if (!event.dataTransfer) return

    if (libraryStore.selectedIds.has(id) && libraryStore.selectedIds.size > 1) {
      event.dataTransfer.setData(
        'application/x-distillery-media-ids',
        JSON.stringify([...libraryStore.selectedIds])
      )
    }

    event.dataTransfer.setData('application/x-distillery-media-id', id)
    event.dataTransfer.setData('text/plain', id)
  }

  return {
    handleClick,
    handleDragStart
  }
}