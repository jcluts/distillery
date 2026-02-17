import * as React from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area'
import { useMediaItemHandlers } from '@/hooks/useMediaItemHandlers'
import { MediaThumbnail } from '@/components/library/MediaThumbnail'
import { cn } from '@/lib/utils'
import type { MediaRecord } from '@/types'

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

  return (
    <div className="flex h-[120px] shrink-0 items-center gap-2 border-t bg-background px-2">
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

      <ScrollArea className="h-full w-full">
        <div className="flex h-full items-center gap-2 p-2">
          {items.map((m, idx) => {
            return (
              <button
                key={m.id}
                type="button"
                className={cn('rounded-md outline-none', selectionClasses(m.id))}
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