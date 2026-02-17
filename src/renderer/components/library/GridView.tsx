import * as React from 'react'
import { Star, Check, X } from 'lucide-react'

import { useLibraryStore } from '@/stores/library-store'
import { useUIStore } from '@/stores/ui-store'
import { useMediaItemHandlers } from '@/hooks/useMediaItemHandlers'
import { cn } from '@/lib/utils'

function extractDroppedFilePaths(e: React.DragEvent): string[] {
  const files = Array.from(e.dataTransfer.files ?? [])
  const paths = files
    .map((f) => (f as any).path as string | undefined)
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
              <div className="relative h-full w-full overflow-hidden rounded-md border bg-muted">
                {m.thumb_path ? (
                  <img
                    src={m.thumb_path}
                    alt={m.file_name}
                    className="absolute inset-0 h-full w-full object-cover"
                    loading="lazy"
                    draggable={false}
                  />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">
                    {String(index + 1)}
                  </div>
                )}

                {/* Status badge — top left */}
                {m.status && (
                  <div className="absolute top-1.5 left-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm">
                    {m.status === 'selected' ? (
                      <Check className="h-3 w-3" strokeWidth={3} />
                    ) : (
                      <X className="h-3 w-3" strokeWidth={3} />
                    )}
                  </div>
                )}

                {/* Rating stars — top right */}
                {m.rating > 0 && (
                  <div className="absolute top-1.5 right-1.5 flex items-center gap-px drop-shadow-sm">
                    {Array.from({ length: m.rating }, (_, i) => (
                      <Star key={i} className="h-3 w-3 fill-primary text-primary" />
                    ))}
                  </div>
                )}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
