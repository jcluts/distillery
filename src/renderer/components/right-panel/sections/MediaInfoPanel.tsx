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
  const buildQuery = useLibraryStore((s) => s.buildQuery)
  const setItems = useLibraryStore((s) => s.setItems)

  const media = focusedId ? items.find((m) => m.id === focusedId) ?? null : null

  const persistUpdate = React.useCallback(
    async (id: string, updates: { rating?: number; status?: any }) => {
      updateItem(id, updates as any)
      try {
        await window.api.updateMedia(id, updates as any)
      } finally {
        // Re-query to ensure filters stay consistent (e.g. item might drop out of view)
        const page = await window.api.getMedia(buildQuery())
        setItems(page)
      }
    },
    [buildQuery, setItems, updateItem]
  )

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
              void persistUpdate(media.id, { rating: r })
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
              if (v === 'unmarked') void persistUpdate(media.id, { status: null })
              else if (v === 'selected' || v === 'rejected') void persistUpdate(media.id, { status: v as any })
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
              {media?.file_size ? `${(media.file_size / (1024 * 1024)).toFixed(1)} MB` : '—'}
            </div>
            <div className="text-xs text-muted-foreground">
              {media?.created_at ? new Date(media.created_at).toLocaleString() : '—'}
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
