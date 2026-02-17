import * as React from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'

import { useLibraryStore } from '@/stores/library-store'
import { useUIStore } from '@/stores/ui-store'
import { useMediaItemHandlers } from '@/hooks/useMediaItemHandlers'
import { cn } from '@/lib/utils'
import { MediaThumbnail } from '@/components/library/MediaThumbnail'
import { GRID_BUFFER_ROWS } from '@/lib/constants'
import type { MediaRecord } from '@/types'

const GRID_GAP = 12 // Tailwind gap-3

function extractDroppedFilePaths(e: React.DragEvent): string[] {
  type FileWithPath = File & { path?: string }
  const files = Array.from(e.dataTransfer.files ?? [])
  const paths = files
    .map((f) => (f as FileWithPath).path)
    .filter((p): p is string => typeof p === 'string' && p.length > 0)
  return paths
}

interface GridCellProps {
  media: MediaRecord
  index: number
  selectionClasses: (id: string) => Record<string, boolean>
  handleClick: (e: React.MouseEvent, id: string) => void
  handleDragStart: (e: React.DragEvent, id: string) => void
  selectSingle: (id: string) => void
  setViewMode: (mode: 'grid' | 'loupe') => void
}

const GridCell = React.memo(function GridCell({
  media,
  index,
  selectionClasses,
  handleClick,
  handleDragStart,
  selectSingle,
  setViewMode
}: GridCellProps) {
  return (
    <button
      type="button"
      className={cn(
        'group relative aspect-square rounded-lg outline-none',
        selectionClasses(media.id)
      )}
      onClick={(e) => handleClick(e, media.id)}
      onDoubleClick={() => {
        selectSingle(media.id)
        setViewMode('loupe')
      }}
      draggable
      onDragStart={(e) => handleDragStart(e, media.id)}
    >
      <MediaThumbnail media={media} fallbackLabel={String(index + 1)} />
    </button>
  )
})

export function GridView(): React.JSX.Element {
  const items = useLibraryStore((s) => s.items)
  const focusedId = useLibraryStore((s) => s.focusedId)
  const selectSingle = useLibraryStore((s) => s.selectSingle)
  const thumbnailSize = useUIStore((s) => s.thumbnailSize)
  const setViewMode = useUIStore((s) => s.setViewMode)
  const { handleClick, handleDragStart, selectionClasses } = useMediaItemHandlers()

  const scrollRef = React.useRef<HTMLDivElement>(null)
  const [columnCount, setColumnCount] = React.useState(0)
  const layoutReady = columnCount > 0

  // Compute column count from container width + thumbnail size
  React.useEffect(() => {
    const el = scrollRef.current
    if (!el) return

    const computeColumns = (): void => {
      const width = el.clientWidth - 24 // subtract p-3 padding (12px each side)
      // CSS auto-fill minmax logic: how many columns of at least thumbnailSize fit?
      const cols = Math.max(1, Math.floor((width + GRID_GAP) / (thumbnailSize + GRID_GAP)))
      setColumnCount(cols)
    }

    computeColumns()

    const observer = new ResizeObserver(computeColumns)
    observer.observe(el)
    return () => observer.disconnect()
  }, [thumbnailSize])

  const rowCount = layoutReady ? Math.ceil(items.length / columnCount) : 0

  // Each row height = the actual cell height (which is width-based due to aspect-square)
  // With auto-fill minmax, each column is >= thumbnailSize. Compute actual column width:
  const estimateRowHeight = React.useCallback(() => {
    const el = scrollRef.current
    if (!el) return thumbnailSize + GRID_GAP
    const width = el.clientWidth - 24
    const colWidth = (width - GRID_GAP * (columnCount - 1)) / columnCount
    return colWidth + GRID_GAP // aspect-square so height = width, plus gap
  }, [thumbnailSize, columnCount])

  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => scrollRef.current,
    estimateSize: estimateRowHeight,
    overscan: GRID_BUFFER_ROWS
  })

  // Scroll to the focused item's row on mount (e.g. returning from loupe view)
  const initialScrollDone = React.useRef(false)
  React.useEffect(() => {
    if (initialScrollDone.current) return
    if (!focusedId || !layoutReady) return
    const idx = items.findIndex((m) => m.id === focusedId)
    if (idx < 0) return
    const row = Math.floor(idx / columnCount)
    virtualizer.scrollToIndex(row, { align: 'center' })
    initialScrollDone.current = true
  }, [focusedId, items, columnCount, layoutReady, virtualizer])

  const onDropImport = React.useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    const filePaths = extractDroppedFilePaths(e)
    if (filePaths.length === 0) return

    await window.api.importMedia(filePaths)
  }, [])

  return (
    <div
      ref={scrollRef}
      className="h-full overflow-auto bg-muted/20 p-3"
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDropImport}
    >
      <div
        style={{
          height: virtualizer.getTotalSize(),
          position: 'relative',
          width: '100%'
        }}
      >
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const rowStartIndex = virtualRow.index * columnCount
          const rowItems = items.slice(rowStartIndex, rowStartIndex + columnCount)

          return (
            <div
              key={virtualRow.index}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: virtualRow.size - GRID_GAP,
                transform: `translateY(${virtualRow.start}px)`,
                display: 'grid',
                gridTemplateColumns: `repeat(${columnCount}, 1fr)`,
                gap: GRID_GAP
              }}
            >
              {rowItems.map((m, colIdx) => (
                <GridCell
                  key={m.id}
                  media={m}
                  index={rowStartIndex + colIdx}
                  selectionClasses={selectionClasses}
                  handleClick={handleClick}
                  handleDragStart={handleDragStart}
                  selectSingle={selectSingle}
                  setViewMode={setViewMode}
                />
              ))}
            </div>
          )
        })}
      </div>
    </div>
  )
}
