import { useLibraryStore } from '@/stores/library'

export function useGridSelection(): {
  handleClick: (event: MouseEvent, id: string) => void
  handleDoubleClick: (id: string) => void
} {
  const libraryStore = useLibraryStore()

  function handleClick(event: MouseEvent, id: string): void {
    if (event.ctrlKey || event.metaKey) {
      libraryStore.toggleSelect(id)
      return
    }

    if (event.shiftKey) {
      libraryStore.rangeSelect(id)
      return
    }

    libraryStore.selectSingle(id)
  }

  function handleDoubleClick(id: string): void {
    libraryStore.selectSingle(id)
  }

  return {
    handleClick,
    handleDoubleClick
  }
}
