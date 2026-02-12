import * as React from 'react'
import { Grid2X2, Image as ImageIcon } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Slider } from '@/components/ui/slider'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { STATUS_BAR_HEIGHT_PX } from '@/lib/layout'
import { THUMBNAIL_SIZE_MAX, THUMBNAIL_SIZE_MIN } from '@/lib/constants'
import { useEngineStore } from '@/stores/engine-store'
import { useLibraryStore } from '@/stores/library-store'
import { useQueueStore } from '@/stores/queue-store'
import { useUIStore } from '@/stores/ui-store'
import { cn } from '@/lib/utils'

function formatElapsed(ms: number | null): string {
  if (!ms) return '0.0s'
  return `${(ms / 1000).toFixed(1)}s`
}

function EngineDot({ state }: { state: string }): React.JSX.Element {
  const cls =
    state === 'ready'
      ? 'bg-primary'
      : state === 'loading' || state === 'starting'
        ? 'bg-secondary'
        : state === 'error'
          ? 'bg-destructive'
          : 'bg-muted-foreground'

  return <span className={cn('inline-block size-2 rounded-full', cls)} />
}

export function StatusBar(): React.JSX.Element {
  const engineState = useEngineStore((s) => s.state)
  const engineModelName = useEngineStore((s) => s.modelName)
  const engineError = useEngineStore((s) => s.error)

  const thumbnailSize = useUIStore((s) => s.thumbnailSize)
  const setThumbnailSize = useUIStore((s) => s.setThumbnailSize)
  const viewMode = useUIStore((s) => s.viewMode)
  const setViewMode = useUIStore((s) => s.setViewMode)

  const total = useLibraryStore((s) => s.total)
  const items = useLibraryStore((s) => s.items)

  const queueItems = useQueueStore((s) => s.items)
  const activePhase = useQueueStore((s) => s.activePhase)
  const activeStep = useQueueStore((s) => s.activeStep)
  const activeTotalSteps = useQueueStore((s) => s.activeTotalSteps)
  const activeElapsedMs = useQueueStore((s) => s.activeElapsedMs)

  const progressValue =
    activeStep != null && activeTotalSteps != null && activeTotalSteps > 0
      ? Math.round((activeStep / activeTotalSteps) * 100)
      : 0

  const queueDepth = queueItems.filter(
    (q) => q.status === 'pending' || q.status === 'processing'
  ).length

  return (
    <div
      className="flex items-center gap-3 border-t bg-background px-3 text-xs"
      style={{ height: STATUS_BAR_HEIGHT_PX }}
    >
      <div className="flex min-w-0 items-center gap-2">
        <EngineDot state={engineState} />
        <span className="truncate text-muted-foreground">
          {engineState === 'ready'
            ? `Model loaded${engineModelName ? `: ${engineModelName}` : ''}`
            : engineState === 'loading'
              ? 'Loading model…'
              : engineState === 'idle'
                ? 'Engine idle'
                : engineState === 'error'
                  ? `Engine error${engineError ? `: ${engineError}` : ''}`
                  : 'Engine stopped'}
        </span>
      </div>

      <div className="mx-auto flex min-w-0 items-center gap-2">
        {activePhase ? (
          <>
            <span className="truncate text-muted-foreground">{activePhase}</span>
            <div className="w-40">
              <Progress value={progressValue} />
            </div>
            <span className="tabular-nums text-muted-foreground">
              {activeStep ?? 0}/{activeTotalSteps ?? 0} · {formatElapsed(activeElapsedMs)}
            </span>
          </>
        ) : null}
      </div>

      <div className="flex items-center gap-3">
        <div className="flex w-40 items-center gap-2">
          <span className="text-muted-foreground">Thumbs</span>
          <Slider
            value={[thumbnailSize]}
            min={THUMBNAIL_SIZE_MIN}
            max={THUMBNAIL_SIZE_MAX}
            step={10}
            onValueChange={(v) => setThumbnailSize(v[0] ?? thumbnailSize)}
          />
        </div>

        <ToggleGroup
          type="single"
          value={viewMode}
          onValueChange={(v) => {
            if (v === 'grid' || v === 'loupe') setViewMode(v)
          }}
        >
          <ToggleGroupItem value="grid" aria-label="Grid view" size="icon">
            <Grid2X2 />
          </ToggleGroupItem>
          <ToggleGroupItem value="loupe" aria-label="Loupe view" size="icon">
            <ImageIcon />
          </ToggleGroupItem>
        </ToggleGroup>

        <span className="text-muted-foreground">
          {total || items.length} images
        </span>

        {queueDepth > 0 ? (
          <Badge variant="secondary">{queueDepth} in queue</Badge>
        ) : null}
      </div>
    </div>
  )
}
