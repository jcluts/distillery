import * as React from 'react'
import { Star } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { useLibraryStore } from '@/stores/library-store'
import { cn } from '@/lib/utils'

function PanelHeader({ title }: { title: string }): React.JSX.Element {
  return (
    <div className="px-4 pt-4">
      <div className="text-xs font-semibold tracking-wider text-muted-foreground">
        {title.toUpperCase()}
      </div>
      <Separator className="mt-3" />
    </div>
  )
}

function StarRating({
  rating,
  onChange
}: {
  rating: number
  onChange: (rating: number) => void
}): React.JSX.Element {
  return (
    <div className="flex items-center gap-1">
      {Array.from({ length: 5 }).map((_, i) => {
        const value = i + 1
        const active = value <= rating
        return (
          <button
            key={value}
            type="button"
            className={cn(
              'rounded-sm p-1 transition-colors hover:bg-accent',
              active ? 'text-primary' : 'text-muted-foreground'
            )}
            onClick={() => onChange(value)}
            aria-label={`Set rating ${value}`}
          >
            <Star className={cn('size-4', active && 'fill-current')} />
          </button>
        )
      })}
    </div>
  )
}

export function MediaInfoPanel(): React.JSX.Element {
  const items = useLibraryStore((s) => s.items)
  const focusedId = useLibraryStore((s) => s.focusedId)
  const updateItem = useLibraryStore((s) => s.updateItem)

  const media = focusedId ? items.find((m) => m.id === focusedId) ?? null : null

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <PanelHeader title="Media info" />

      <div className="min-h-0 flex-1 space-y-4 overflow-auto px-4 pb-4 pt-4">
        <div className="space-y-2">
          <div className="text-xs font-medium text-muted-foreground">Rating</div>
          <StarRating
            rating={media?.rating ?? 0}
            onChange={(r) => {
              if (!media) return
              updateItem(media.id, { rating: r })
            }}
          />
        </div>

        <div className="space-y-2">
          <div className="text-xs font-medium text-muted-foreground">Status</div>
          <ToggleGroup
            type="single"
            value={media?.status ?? 'unmarked'}
            onValueChange={(v) => {
              if (!media || !v) return
              if (v === 'unmarked') updateItem(media.id, { status: null })
              else if (v === 'selected' || v === 'rejected') updateItem(media.id, { status: v as any })
            }}
          >
            <ToggleGroupItem value="selected" size="sm">Selected</ToggleGroupItem>
            <ToggleGroupItem value="rejected" size="sm">Rejected</ToggleGroupItem>
            <ToggleGroupItem value="unmarked" size="sm">Clear</ToggleGroupItem>
          </ToggleGroup>
        </div>

        <Separator />

        <div className="space-y-2">
          <div className="text-xs font-semibold tracking-wider text-muted-foreground">FILE INFO</div>
          <div className="space-y-1 text-sm">
            <div className="truncate">{media?.file_name ?? 'No selection'}</div>
            <div className="text-xs text-muted-foreground">
              {media?.width && media?.height ? `${media.width} × ${media.height}` : '—'}
            </div>
            <div className="text-xs text-muted-foreground">
              {media?.origin ? (
                <Badge variant="secondary">{media.origin}</Badge>
              ) : (
                <Badge variant="outline">—</Badge>
              )}
            </div>
          </div>
        </div>

        <Separator />

        <div className="space-y-2">
          <div className="text-xs font-semibold tracking-wider text-muted-foreground">KEYWORDS</div>
          <div className="text-xs text-muted-foreground">(MVP: display-only)</div>
        </div>
      </div>
    </div>
  )
}
