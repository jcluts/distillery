import * as React from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useVirtualizer } from '@tanstack/react-virtual'

import { Button } from '@/components/ui/button'
import { useMediaItemHandlers } from '@/hooks/useMediaItemHandlers'
import { MediaThumbnail } from '@/components/library/MediaThumbnail'
import { cn } from '@/lib/utils'
import type { MediaRecord } from '@/types'

const FILMSTRIP_ITEM_SIZE = 86
const FILMSTRIP_GAP = 8 // gap-2
const FILMSTRIP_OVERSCAN = 5

interface LoupeFilmstripProps {
  items: MediaRecord[]
  currentIndex: number
  onSelect: (id: string) => void
}

export function LoupeFilmstrip({
  items,
  currentIndex,
  onSelect
}: LoupeFilmstripProps): React.JSX.Element {
  const { handleClick, handleDragStart, selectionClasses } = useMediaItemHandlers()
  const scrollRef = React.useRef<HTMLDivElement>(null)

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => FILMSTRIP_ITEM_SIZE + FILMSTRIP_GAP,
    horizontal: true,
    overscan: FILMSTRIP_OVERSCAN
  })

  // Invalidate cached measurements when item count changes
  React.useEffect(() => {
    virtualizer.measure()
  }, [items.length, virtualizer])

  // Center on the current item on initial mount; keep visible on subsequent changes
  const isInitialScroll = React.useRef(true)
  React.useEffect(() => {
    if (currentIndex >= 0 && currentIndex < items.length) {
      const align = isInitialScroll.current ? 'center' : 'auto'
      isInitialScroll.current = false
      virtualizer.scrollToIndex(currentIndex, { align })
    }
  }, [currentIndex, items.length, virtualizer])

  return (
    <div className="flex h-[120px] shrink-0 items-center gap-2 px-2">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={() => {
          if (currentIndex > 0) onSelect(items[currentIndex - 1]!.id)
        }}
        disabled={currentIndex <= 0}
        aria-label="Previous"
      >
        <ChevronLeft />
      </Button>

      <div ref={scrollRef} className="h-full w-full overflow-x-auto px-3 overflow-y-hidden">
        <div
          className="relative flex h-full items-center"
          style={{
            width: virtualizer.getTotalSize(),
            minHeight: '100%'
          }}
        >
          {virtualizer.getVirtualItems().map((virtualItem) => {
            const m = items[virtualItem.index]!
            const idx = virtualItem.index

            return (
              <button
                key={m.id}
                type="button"
                className={cn(
                  'absolute top-1/2 -translate-y-1/2 rounded-md outline-none',
                  selectionClasses(m.id)
                )}
                style={{
                  left: virtualItem.start,
                  width: FILMSTRIP_ITEM_SIZE,
                  height: FILMSTRIP_ITEM_SIZE
                }}
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
      </div>

      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={() => {
          if (currentIndex >= 0 && currentIndex < items.length - 1) {
            onSelect(items[currentIndex + 1]!.id)
          }
        }}
        disabled={currentIndex < 0 || currentIndex >= items.length - 1}
        aria-label="Next"
      >
        <ChevronRight />
      </Button>
    </div>
  )
}
