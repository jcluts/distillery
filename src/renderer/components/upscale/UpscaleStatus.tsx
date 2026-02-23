import * as React from 'react'

import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'
import { useUpscaleStore } from '@/stores/upscale-store'

export function UpscaleStatus(): React.JSX.Element | null {
  const isUpscaling = useUpscaleStore((s) => s.isUpscaling)
  const progressPhase = useUpscaleStore((s) => s.progressPhase)
  const progressMessage = useUpscaleStore((s) => s.progressMessage)
  const progressStep = useUpscaleStore((s) => s.progressStep)
  const progressTotalSteps = useUpscaleStore((s) => s.progressTotalSteps)
  const lastUpscaleTimeMs = useUpscaleStore((s) => s.lastUpscaleTimeMs)

  // Decide visibility: show when upscaling, error, or just finished
  const hasError = progressPhase === 'error'
  const hasContent = isUpscaling || hasError || lastUpscaleTimeMs !== null

  if (!hasContent) return null

  let statusLabel: string
  let statusVariant: 'default' | 'destructive' = 'default'

  if (isUpscaling) {
    if (progressPhase === 'preparing') {
      statusLabel = 'Preparing…'
    } else if (progressPhase === 'upscaling') {
      statusLabel = 'Upscaling…'
    } else if (progressPhase === 'saving') {
      statusLabel = 'Saving…'
    } else {
      statusLabel = 'Processing…'
    }
  } else if (hasError) {
    statusLabel = progressMessage ? `Error: ${progressMessage}` : 'Upscale error'
    statusVariant = 'destructive'
  } else if (lastUpscaleTimeMs !== null) {
    statusLabel = `Completed in ${(lastUpscaleTimeMs / 1000).toFixed(1)}s`
  } else {
    statusLabel = 'Idle'
  }

  const progressValue =
    progressStep != null && progressTotalSteps != null && progressTotalSteps > 0
      ? Math.round((progressStep / progressTotalSteps) * 100)
      : 0

  return (
    <Card className="p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <Badge
          variant="secondary"
          className={cn(
            'max-w-[75%] truncate text-xs',
            statusVariant === 'destructive' && 'border border-destructive text-destructive'
          )}
        >
          {statusLabel}
        </Badge>

        <div className="flex items-center gap-2">
          {isUpscaling && progressPhase === 'upscaling' && progressStep != null && progressTotalSteps != null && (
            <span className="text-xs tabular-nums text-muted-foreground">
              {progressStep} out of {progressTotalSteps} tiles
            </span>
          )}
        </div>
      </div>

      {isUpscaling && progressPhase === 'preparing' && <Progress className="animate-pulse" />}
      {isUpscaling && progressPhase === 'upscaling' && <Progress value={progressValue} />}
      {isUpscaling && progressPhase === 'saving' && <Progress value={100} className="animate-pulse" />}
    </Card>
  )
}
