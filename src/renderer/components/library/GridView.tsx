import * as React from 'react'

import { useLibraryStore } from '@/stores/library-store'
import { useUIStore } from '@/stores/ui-store'
import { cn } from '@/lib/utils'

function PlaceholderThumb({ label }: { label: string }): React.JSX.Element {
  return (
    <div className="relative h-full w-full overflow-hidden rounded-md border bg-muted">
      <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">
        {label}
      </div>
    </div>
  )
}

export function GridView(): React.JSX.Element {
  const items = useLibraryStore((s) => s.items)
  const focusedId = useLibraryStore((s) => s.focusedId)
  const selectSingle = useLibraryStore((s) => s.selectSingle)
  const thumbnailSize = useUIStore((s) => s.thumbnailSize)
  const setViewMode = useUIStore((s) => s.setViewMode)

  const gridStyle = React.useMemo<React.CSSProperties>(
    () => ({
      gridTemplateColumns: `repeat(auto-fill, minmax(${thumbnailSize}px, 1fr))`
    }),
    [thumbnailSize]
  )

  return (
    <div className="h-full overflow-auto bg-muted/20 p-3">
      <div className="grid gap-3" style={gridStyle}>
        {items.map((m, index) => {
          const selected = m.id === focusedId
          return (
            <button
              key={m.id}
              type="button"
              className={cn(
                'group relative aspect-square rounded-lg outline-none',
                selected && 'ring-2 ring-ring'
              )}
              onClick={() => selectSingle(m.id)}
              onDoubleClick={() => {
                selectSingle(m.id)
                setViewMode('loupe')
              }}
            >
              <PlaceholderThumb label={String(index + 1)} />
              <div className="mt-1 truncate text-left text-xs text-muted-foreground">
                {m.file_name}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
