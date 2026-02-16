import * as React from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'
import { useEngineStore } from '@/stores/engine-store'
import { useQueueStore } from '@/stores/queue-store'
import { useGenerationStore } from '@/stores/generation-store'

/**
 * Unified generation status indicator.
 *
 * Shown below the Generate button when there is something worth reporting:
 * model loading, active generation progress, or pending items.
 * Replaces the old separate engine-status badge and queue/progress card.
 */
export function GenerationStatus(): React.JSX.Element | null {
  const [isUnloadingModel, setIsUnloadingModel] = React.useState(false)

  // Engine
  const engineState = useEngineStore((s) => s.state)
  const engineModelName = useEngineStore((s) => s.modelName)
  const engineError = useEngineStore((s) => s.error)

  // Queue / progress
  const queueItems = useQueueStore((s) => s.items)
  const activePhase = useQueueStore((s) => s.activePhase)
  const activeStep = useQueueStore((s) => s.activeStep)
  const activeTotalSteps = useQueueStore((s) => s.activeTotalSteps)

  // Generations (for prompt labels)
  const generations = useGenerationStore((s) => s.generations)

  const visibleQueueItems = React.useMemo(
    () => queueItems.filter((q) => q.status === 'pending' || q.status === 'processing'),
    [queueItems]
  )

  const isModelLoading = engineState === 'loading'
  const isGenerating = !!activePhase && !isModelLoading
  const isQueueProcessing = queueItems.some((q) => q.status === 'processing')
  const hasError = engineState === 'error'
  const isModelReady = engineState === 'ready'
  const canUnloadModel = isModelReady && !isQueueProcessing && !isUnloadingModel

  const progressValue =
    activeStep != null && activeTotalSteps != null && activeTotalSteps > 0
      ? Math.round((activeStep / activeTotalSteps) * 100)
      : 0

  // Decide visibility: show when loading, generating, pending items, error, or model ready (idle with model is not interesting)
  const hasContent =
    isModelLoading || isGenerating || visibleQueueItems.length > 0 || hasError || isModelReady

  if (!hasContent) return null

  // ---------------------------------------------------------------------------
  // Status line — adapts to current phase
  // ---------------------------------------------------------------------------
  let statusLabel: string
  let statusVariant: 'default' | 'destructive' = 'default'

  if (isModelLoading) {
    statusLabel = 'Loading model…'
  } else if (isGenerating) {
    statusLabel = activePhase ? `Generating: ${activePhase}` : 'Generating…'
  } else if (hasError) {
    statusLabel = engineError ? `Engine error: ${engineError}` : 'Engine error'
    statusVariant = 'destructive'
  } else if (isModelReady) {
    statusLabel = 'Model ready'
  } else {
    statusLabel = 'Idle'
  }

  return (
    <Card className="p-3 space-y-2">
      {/* Status header row */}
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
          {/* Step counter during generation */}
          {isGenerating && activeStep != null && activeTotalSteps != null && (
            <span className="text-xs tabular-nums text-muted-foreground">
              {activeStep}/{activeTotalSteps}
            </span>
          )}

          {/* Unload model — only when model is loaded and idle */}
          {isModelReady && !isGenerating && (
            <Button
              type="button"
              size="xs"
              variant="outline"
              disabled={!canUnloadModel}
              onClick={async () => {
                setIsUnloadingModel(true)
                try {
                  await window.api.unloadModel()
                } catch {
                  // engine status event drives error state
                } finally {
                  setIsUnloadingModel(false)
                }
              }}
            >
              {isUnloadingModel ? 'Unloading…' : 'Unload model'}
            </Button>
          )}
        </div>
      </div>

      {/* Progress bar */}
      {isModelLoading && <Progress className="animate-pulse" />}
      {isGenerating && <Progress value={progressValue} />}

      {/* Pending / processing items */}
      {visibleQueueItems.length > 0 && (
        <div className="space-y-1">
          {visibleQueueItems.slice(0, 3).map((q) => {
            const generationId = q.correlation_id
            return (
              <div key={q.id} className="flex items-center justify-between text-xs">
                <span className="truncate text-muted-foreground">
                  {generations.find((g) => g.id === generationId)?.prompt ?? generationId ?? q.id}
                </span>
                <div className="ml-2 flex items-center gap-2">
                  <Badge variant="outline">{q.status}</Badge>
                  {q.status === 'pending' && generationId ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => window.api.cancelGeneration(generationId)}
                    >
                      Cancel
                    </Button>
                  ) : null}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </Card>
  )
}
