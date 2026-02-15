import * as React from 'react'

import { Progress } from '@/components/ui/progress'
import { useEngineStore } from '@/stores/engine-store'
import { useQueueStore } from '@/stores/queue-store'
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

export function LeftSidebarStatusBar(): React.JSX.Element {
  const engineState = useEngineStore((s) => s.state)
  const engineModelName = useEngineStore((s) => s.modelName)
  const engineError = useEngineStore((s) => s.error)

  const activePhase = useQueueStore((s) => s.activePhase)
  const activeStep = useQueueStore((s) => s.activeStep)
  const activeTotalSteps = useQueueStore((s) => s.activeTotalSteps)
  const activeElapsedMs = useQueueStore((s) => s.activeElapsedMs)

  const progressValue =
    activeStep != null && activeTotalSteps != null && activeTotalSteps > 0
      ? Math.round((activeStep / activeTotalSteps) * 100)
      : 0

  const engineLabel =
    engineState === 'ready'
      ? `Model loaded${engineModelName ? `: ${engineModelName}` : ''}`
      : engineState === 'loading'
        ? 'Loading model…'
        : engineState === 'idle'
          ? 'Ready'
          : engineState === 'error'
            ? `Engine error${engineError ? `: ${engineError}` : ''}`
            : 'Engine stopped'

  return (
    <div className="flex h-10 shrink-0 items-center gap-2 px-3 text-xs">
      {/* Generation progress (when active) */}
      {activePhase ? (
        <>
          <div className="w-24 shrink-0">
            <Progress value={progressValue} className="h-1.5" />
          </div>
          <span className="shrink-0 tabular-nums text-muted-foreground">
            {activeStep ?? 0}/{activeTotalSteps ?? 0} · {formatElapsed(activeElapsedMs)}
          </span>
        </>
      ) : (
        <>
          {/* Engine status */}
          <EngineDot state={engineState} />
          <span className="min-w-0 truncate text-muted-foreground">{engineLabel}</span>
        </>
      )}
    </div>
  )
}
