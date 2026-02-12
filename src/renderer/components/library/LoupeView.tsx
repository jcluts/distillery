import * as React from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area'
import { useLibraryStore } from '@/stores/library-store'
import { CanvasViewer } from '@/components/library/canvas/CanvasViewer'
import { cn } from '@/lib/utils'

function PlaceholderThumb({ label }: { label: string }): React.JSX.Element {
  return (
    <div className="relative size-[86px] overflow-hidden rounded-md border bg-muted">
      <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">
        {label}
      </div>
    </div>
  )
}

export function LoupeView(): React.JSX.Element {
  const items = useLibraryStore((s) => s.items)
  const focusedId = useLibraryStore((s) => s.focusedId)
  const selectSingle = useLibraryStore((s) => s.selectSingle)

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
        <CanvasViewer media={current} />
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
              const isActive = m.id === focusedId
              return (
                <button
                  key={m.id}
                  type="button"
                  className={cn(
                    'rounded-md outline-none',
                    isActive && 'ring-2 ring-ring'
                  )}
                  onClick={() => selectSingle(m.id)}
                >
                  <PlaceholderThumb label={String(idx + 1)} />
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
