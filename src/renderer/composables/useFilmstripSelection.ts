import { useGridSelection } from '@/composables/useGridSelection'
import { useLibraryMediaDrag } from '@/composables/useLibraryMediaDrag'

export function useFilmstripSelection(): {
  handleClick: (event: MouseEvent, id: string) => void
  handleDragStart: (event: DragEvent, id: string) => void
} {
  const { handleClick } = useGridSelection()
  const { handleDragStart } = useLibraryMediaDrag()

  return {
    handleClick,
    handleDragStart
  }
}
