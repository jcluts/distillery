import * as React from 'react'
import { X } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { ASPECT_RATIOS, RESOLUTION_PRESETS, computeDimensions } from '@/lib/constants'
import { useGenerationStore } from '@/stores/generation-store'
import { useEngineStore } from '@/stores/engine-store'
import { useQueueStore } from '@/stores/queue-store'
import { Progress } from '@/components/ui/progress'
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

function MockThumb({ label }: { label: string }): React.JSX.Element {
  return (
    <div className="relative overflow-hidden rounded-md border bg-muted">
      <div className="aspect-square w-16" />
      <div className="absolute inset-0 flex items-center justify-center text-[10px] text-muted-foreground">
        {label}
      </div>
    </div>
  )
}

export function GenerationPanel(): React.JSX.Element {
  const prompt = useGenerationStore((s) => s.prompt)
  const setPrompt = useGenerationStore((s) => s.setPrompt)
  const refImagePaths = useGenerationStore((s) => s.refImagePaths)
  const removeRefImagePath = useGenerationStore((s) => s.removeRefImagePath)
  const resolution = useGenerationStore((s) => s.resolution)
  const setResolution = useGenerationStore((s) => s.setResolution)
  const aspectRatio = useGenerationStore((s) => s.aspectRatio)
  const setAspectRatio = useGenerationStore((s) => s.setAspectRatio)
  const buildParams = useGenerationStore((s) => s.buildParams)

  const engineState = useEngineStore((s) => s.state)
  const engineReady = engineState === 'ready' || engineState === 'idle'

  const queueItems = useQueueStore((s) => s.items)
  const activePhase = useQueueStore((s) => s.activePhase)
  const activeStep = useQueueStore((s) => s.activeStep)
  const activeTotalSteps = useQueueStore((s) => s.activeTotalSteps)

  const ratio = ASPECT_RATIOS.find((r) => r.label === aspectRatio) ?? ASPECT_RATIOS[0]
  const dims = computeDimensions(resolution, ratio.width, ratio.height)

  const params = buildParams()
  const generateDisabled = !engineReady || !params.prompt.trim()
  const showQueue = (queueItems?.length ?? 0) > 0 || !!activePhase

  const progressValue =
    activeStep != null && activeTotalSteps != null && activeTotalSteps > 0
      ? Math.round((activeStep / activeTotalSteps) * 100)
      : 0

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <PanelHeader title="Generation" />

      <div className="min-h-0 flex-1 space-y-4 overflow-auto px-4 pb-4 pt-4">
        <div className="space-y-2">
          <div className="text-xs font-medium text-muted-foreground">Prompt</div>
          <Textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Describe what you want to see..."
            className="resize-y"
            data-focus-prompt="true"
          />
        </div>

        <div className="space-y-2">
          <div className="text-xs font-medium text-muted-foreground">Reference images</div>
          <div
            className={cn(
              'rounded-md border border-dashed bg-background p-3',
              refImagePaths.length === 0 ? 'text-muted-foreground' : ''
            )}
          >
            {refImagePaths.length === 0 ? (
              <div className="text-sm">
                Drag images here, or click to browse (mock)
              </div>
            ) : (
              <div className="flex items-center gap-2 overflow-x-auto">
                {refImagePaths.map((p, idx) => (
                  <div key={p} className="relative">
                    <MockThumb label={`Ref ${idx + 1}`} />
                    <Button
                      type="button"
                      size="icon"
                      variant="secondary"
                      className="absolute -right-2 -top-2 h-6 w-6 rounded-full"
                      onClick={() => removeRefImagePath(p)}
                      aria-label="Remove reference"
                    >
                      <X className="size-3" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="space-y-3">
          <div className="text-xs font-medium text-muted-foreground">Resolution</div>
          <div className="grid grid-cols-2 gap-2">
            <Select
              value={String(resolution)}
              onValueChange={(v) => setResolution(Number(v))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Resolution" />
              </SelectTrigger>
              <SelectContent>
                {RESOLUTION_PRESETS.map((p) => (
                  <SelectItem key={p.value} value={String(p.value)}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="flex items-center justify-end">
              <Badge variant="secondary" className="tabular-nums">
                {dims.width} × {dims.height}
              </Badge>
            </div>
          </div>

          <div className="text-xs font-medium text-muted-foreground">Aspect ratio</div>
          <ToggleGroup
            type="single"
            value={aspectRatio}
            onValueChange={(v) => {
              if (v) setAspectRatio(v as any)
            }}
            className="flex flex-wrap justify-start"
          >
            {ASPECT_RATIOS.map((r) => (
              <ToggleGroupItem key={r.label} value={r.label} size="sm">
                {r.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>

        <Button type="button" className="w-full" disabled={generateDisabled}>
          Generate
        </Button>

        {showQueue ? (
          <Card className="p-3">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{activePhase ? `Generating: ${activePhase}` : 'Queue'}</span>
              {activeStep != null && activeTotalSteps != null ? (
                <span className="tabular-nums">
                  {activeStep}/{activeTotalSteps}
                </span>
              ) : null}
            </div>
            {activePhase ? (
              <div className="mt-2">
                <Progress value={progressValue} />
              </div>
            ) : null}
            <div className="mt-2 space-y-1">
              {queueItems.slice(0, 3).map((q) => (
                <div
                  key={q.id}
                  className="flex items-center justify-between text-xs"
                >
                  <span className="truncate text-muted-foreground">
                    {q.generation_id}
                  </span>
                  <Badge variant="outline" className="ml-2">
                    {q.status}
                  </Badge>
                </div>
              ))}
            </div>
          </Card>
        ) : null}
      </div>
    </div>
  )
}
