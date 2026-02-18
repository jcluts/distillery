import * as React from 'react'

import { useLibraryStore } from '@/stores/library-store'
import { useUIStore } from '@/stores/ui-store'
import { CanvasViewer } from '@/components/library/canvas/CanvasViewer'
import { LoupeFilmstrip } from '@/components/library/LoupeFilmstrip'

export function LoupeView(): React.JSX.Element {
  const items = useLibraryStore((s) => s.items)
  const focusedId = useLibraryStore((s) => s.focusedId)
  const selectSingle = useLibraryStore((s) => s.selectSingle)
  const loupeZoom = useUIStore((s) => s.loupeZoom)

  const currentIndex = focusedId ? items.findIndex((m) => m.id === focusedId) : -1
  const current = currentIndex >= 0 ? items[currentIndex] : (items[0] ?? null)

  React.useEffect(() => {
    if (!focusedId && items[0]) {
      selectSingle(items[0].id)
    }
  }, [focusedId, items, selectSingle])

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="min-h-0 flex-1 overflow-hidden">
        <CanvasViewer media={current} zoom={loupeZoom} />
      </div>

      <LoupeFilmstrip items={items} currentIndex={currentIndex} onSelect={selectSingle} />
    </div>
  )
}
