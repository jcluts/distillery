import * as React from 'react'

import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import type { GenerationRecord, GenerationStatus } from '@/types'

interface TimelineItemCardProps {
  generation: GenerationRecord
  thumbnailSrc?: string
  onOpen: () => void
}

function statusBadgeVariant(status: GenerationStatus): 'default' | 'secondary' | 'outline' {
  if (status === 'completed') return 'default'
  if (status === 'failed') return 'outline'
  return 'secondary'
}

function formatRelative(iso: string): string {
  const t = new Date(iso).getTime()
  const delta = Date.now() - t
  if (!Number.isFinite(delta) || delta < 0) return 'Just now'
  const sec = Math.floor(delta / 1000)
  if (sec < 60) return `${sec}s ago`
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  const day = Math.floor(hr / 24)
  return `${day}d ago`
}

export function TimelineItemCard({
  generation,
  thumbnailSrc,
  onOpen
}: TimelineItemCardProps): React.JSX.Element {
  return (
    <Card
      className="w-full cursor-default overflow-hidden p-2.5 transition-colors hover:bg-accent/40"
      onClick={onOpen}
    >
      <div className="min-w-0 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <Badge
              variant={statusBadgeVariant(generation.status)}
              className="h-5 px-1.5 text-[10px] font-semibold capitalize"
            >
              {generation.status}
            </Badge>
            <span className="shrink-0 text-xs font-medium text-muted-foreground">#{generation.number}</span>
          </div>
          <span className="shrink-0 text-xs text-muted-foreground">{formatRelative(generation.created_at)}</span>
        </div>

        <div className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
          <span className="min-w-0 flex-1 truncate">{generation.model_file ?? 'Model'}</span>
          {generation.total_time_ms ? (
            <span className="shrink-0 tabular-nums">{(generation.total_time_ms / 1000).toFixed(1)}s</span>
          ) : null}
        </div>

        {generation.error ? <div className="truncate text-xs text-destructive">{generation.error}</div> : null}

        {thumbnailSrc ? (
          <div className="flex justify-start">
            <div className="relative size-20 overflow-hidden rounded-md border bg-muted/40 p-1">
              <img
                src={thumbnailSrc}
                alt={`Output for #${generation.number}`}
                className="h-full w-full object-contain"
                draggable={false}
              />
            </div>
          </div>
        ) : null}
      </div>
    </Card>
  )
}