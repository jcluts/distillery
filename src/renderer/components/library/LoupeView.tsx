import * as React from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area'
import { useLibraryStore } from '@/stores/library-store'
import { useUIStore } from '@/stores/ui-store'
import { useMediaItemHandlers } from '@/hooks/useMediaItemHandlers'
import { CanvasViewer } from '@/components/library/canvas/CanvasViewer'
import { MediaThumbnail } from '@/components/library/MediaThumbnail'
import { cn } from '@/lib/utils'

export function LoupeView(): React.JSX.Element {
  const items = useLibraryStore((s) => s.items)
  const focusedId = useLibraryStore((s) => s.focusedId)
  const selectSingle = useLibraryStore((s) => s.selectSingle)
  const loupeZoom = useUIStore((s) => s.loupeZoom)
  const { handleClick, handleDragStart, selectionClasses } = useMediaItemHandlers()

  const currentIndex = focusedId
    ? items.findIndex((m) => m.id === focusedId)
    : -1
  const current = currentIndex >= 0 ? items[currentIndex] : items[0] ?? null

  React.useEffect(() => {
    if (!focusedId && items[0]) {
      selectSingle(items[0].id)
    }
  }, [focusedId, items, selectSingle])

  return (
    <div className="flex h-full flex-col overflow-hidden bg-muted/10">
      <div className="min-h-0 flex-1 overflow-hidden">
        <CanvasViewer media={current} zoom={loupeZoom} />
      </div>

      <div className="flex h-[120px] shrink-0 items-center gap-2 border-t bg-background px-2">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => {
            if (currentIndex > 0) selectSingle(items[currentIndex - 1]!.id)
          }}
          disabled={currentIndex <= 0}
          aria-label="Previous"
        >
          <ChevronLeft />
        </Button>

        <ScrollArea className="h-full w-full">
          <div className="flex h-full items-center gap-2 p-2">
            {items.map((m, idx) => {
              return (
                <button
                  key={m.id}
                  type="button"
                  className={cn(
                    'rounded-md outline-none',
                    selectionClasses(m.id)
                  )}
                  onClick={(e) => handleClick(e, m.id)}
                  draggable
                  onDragStart={(e) => handleDragStart(e, m.id)}
                >
                  <MediaThumbnail
                    media={m}
                    fallbackLabel={String(idx + 1)}
                    className="size-[86px]"
                    overlaySize="filmstrip"
                  />
                </button>
              )
            })}
          </div>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>

        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => {
            if (currentIndex >= 0 && currentIndex < items.length - 1) {
              selectSingle(items[currentIndex + 1]!.id)
            }
          }}
          disabled={currentIndex < 0 || currentIndex >= items.length - 1}
          aria-label="Next"
        >
          <ChevronRight />
        </Button>
      </div>
    </div>
  )
}
