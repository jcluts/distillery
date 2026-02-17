import * as React from 'react'

import { useLibraryStore } from '@/stores/library-store'
import { useUIStore } from '@/stores/ui-store'
import { useMediaItemHandlers } from '@/hooks/useMediaItemHandlers'
import { cn } from '@/lib/utils'
import { MediaThumbnail } from '@/components/library/MediaThumbnail'

function extractDroppedFilePaths(e: React.DragEvent): string[] {
  type FileWithPath = File & { path?: string }
  const files = Array.from(e.dataTransfer.files ?? [])
  const paths = files
    .map((f) => (f as FileWithPath).path)
    .filter((p): p is string => typeof p === 'string' && p.length > 0)
  return paths
}

export function GridView(): React.JSX.Element {
  const items = useLibraryStore((s) => s.items)
  const selectSingle = useLibraryStore((s) => s.selectSingle)
  const thumbnailSize = useUIStore((s) => s.thumbnailSize)
  const setViewMode = useUIStore((s) => s.setViewMode)
  const { handleClick, handleDragStart, selectionClasses } = useMediaItemHandlers()

  const gridStyle = React.useMemo<React.CSSProperties>(
    () => ({
      gridTemplateColumns: `repeat(auto-fill, minmax(${thumbnailSize}px, 1fr))`
    }),
    [thumbnailSize]
  )

  const onDropImport = React.useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    const filePaths = extractDroppedFilePaths(e)
    if (filePaths.length === 0) return

    await window.api.importMedia(filePaths)
    // main process emits library:updated which triggers a refresh
  }, [])

  return (
    <div
      className="h-full overflow-auto bg-muted/20 p-3"
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDropImport}
    >
      <div className="grid gap-3" style={gridStyle}>
        {items.map((m, index) => {
          return (
            <button
              key={m.id}
              type="button"
              className={cn(
                'group relative aspect-square rounded-lg outline-none',
                selectionClasses(m.id)
              )}
              onClick={(e) => handleClick(e, m.id)}
              onDoubleClick={() => {
                selectSingle(m.id)
                setViewMode('loupe')
              }}
              draggable
              onDragStart={(e) => handleDragStart(e, m.id)}
            >
              <MediaThumbnail media={m} fallbackLabel={String(index + 1)} />
            </button>
          )
        })}
      </div>
    </div>
  )
}
