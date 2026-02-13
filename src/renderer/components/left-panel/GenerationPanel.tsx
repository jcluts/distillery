import * as React from 'react'
import { X } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { ASPECT_RATIOS, RESOLUTION_PRESETS, computeDimensions } from '@/lib/constants'
import { useGenerationStore } from '@/stores/generation-store'
import { useEngineStore } from '@/stores/engine-store'
import { useQueueStore } from '@/stores/queue-store'
import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'
import { useLibraryStore } from '@/stores/library-store'
import { ModelSelector } from '@/components/generation/ModelSelector'

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

function extractDroppedFilePaths(e: React.DragEvent): string[] {
  const files = Array.from(e.dataTransfer.files ?? [])
  return files
    .map((f) => (f as any).path as string | undefined)
    .filter((p): p is string => typeof p === 'string' && p.length > 0)
}

function RefThumb({ src, label }: { src: string | null; label: string }): React.JSX.Element {
  return (
    <div className="relative overflow-hidden rounded-md border bg-muted">
      <div className="aspect-square w-16" />
      {src ? (
        <img
          src={src}
          alt={label}
          className="absolute inset-0 h-full w-full object-cover"
          draggable={false}
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center text-[10px] text-muted-foreground">
          {label}
        </div>
      )}
    </div>
  )
}

export function GenerationPanel(): React.JSX.Element {
  const [isUnloadingModel, setIsUnloadingModel] = React.useState(false)

  const prompt = useGenerationStore((s) => s.prompt)
  const setPrompt = useGenerationStore((s) => s.setPrompt)
  const refImageIds = useGenerationStore((s) => s.refImageIds)
  const addRefImage = useGenerationStore((s) => s.addRefImage)
  const removeRefImage = useGenerationStore((s) => s.removeRefImage)
  const refImagePaths = useGenerationStore((s) => s.refImagePaths)
  const removeRefImagePath = useGenerationStore((s) => s.removeRefImagePath)
  const resolution = useGenerationStore((s) => s.resolution)
  const setResolution = useGenerationStore((s) => s.setResolution)
  const aspectRatio = useGenerationStore((s) => s.aspectRatio)
  const setAspectRatio = useGenerationStore((s) => s.setAspectRatio)
  const buildParams = useGenerationStore((s) => s.buildParams)
  const addGeneration = useGenerationStore((s) => s.addGeneration)

  const libraryItems = useLibraryStore((s) => s.items)

  const engineState = useEngineStore((s) => s.state)
  const engineModelName = useEngineStore((s) => s.modelName)
  const engineError = useEngineStore((s) => s.error)
  const engineCanGenerate = engineState === 'ready' || engineState === 'idle'

  const queueItems = useQueueStore((s) => s.items)
  const activePhase = useQueueStore((s) => s.activePhase)
  const activeStep = useQueueStore((s) => s.activeStep)
  const activeTotalSteps = useQueueStore((s) => s.activeTotalSteps)

  const generations = useGenerationStore((s) => s.generations)

  const ratio = ASPECT_RATIOS.find((r) => r.label === aspectRatio) ?? ASPECT_RATIOS[0]
  const dims = computeDimensions(resolution, ratio.width, ratio.height)

  const params = buildParams()
  const generateDisabled = !engineCanGenerate || !params.params.prompt.trim()
  const visibleQueueItems = React.useMemo(
    () => queueItems.filter((q) => q.status === 'pending' || q.status === 'processing'),
    [queueItems]
  )

  const isModelLoading = engineState === 'loading'
  const showQueue = (visibleQueueItems?.length ?? 0) > 0 || !!activePhase || isModelLoading

  const isQueueProcessing = queueItems.some((q) => q.status === 'processing')
  const canUnloadModel = engineState === 'ready' && !isQueueProcessing && !isUnloadingModel

  const modelStatusLabel =
    engineState === 'loading'
      ? 'Loading model…'
      : engineState === 'ready'
        ? engineModelName
          ? `Model ready: ${engineModelName}`
          : 'Model ready'
        : engineState === 'idle'
          ? 'No model loaded'
          : engineState === 'starting'
            ? 'Starting engine…'
            : engineState === 'error'
              ? engineError
                ? `Engine error: ${engineError}`
                : 'Engine error'
              : 'Engine stopped'

  const progressValue =
    activeStep != null && activeTotalSteps != null && activeTotalSteps > 0
      ? Math.round((activeStep / activeTotalSteps) * 100)
      : 0

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <PanelHeader title="Generation" />

      <div className="min-h-0 flex-1 space-y-4 overflow-auto px-4 pb-4 pt-4">
        <ModelSelector />

        <div className="flex items-center justify-between gap-2 rounded-md border bg-muted/30 px-3 py-2">
          <Badge
            variant="secondary"
            className={cn(
              'max-w-[75%] truncate',
              engineState === 'error' && 'border border-destructive text-destructive'
            )}
          >
            {modelStatusLabel}
          </Badge>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={!canUnloadModel}
            onClick={async () => {
              setIsUnloadingModel(true)
              try {
                await window.api.unloadModel()
              } catch {
                // status event drives UI error state
              } finally {
                setIsUnloadingModel(false)
              }
            }}
          >
            {isUnloadingModel ? 'Unloading…' : 'Unload model'}
          </Button>
        </div>

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
              refImagePaths.length === 0 && refImageIds.length === 0 ? 'text-muted-foreground' : ''
            )}
            onDragOver={(e) => e.preventDefault()}
            onDrop={async (e) => {
              e.preventDefault()
              const mediaId = e.dataTransfer.getData('application/x-distillery-media-id')
              if (mediaId) {
                addRefImage(mediaId)
                return
              }

              const filePaths = extractDroppedFilePaths(e)
              if (filePaths.length > 0) {
                const imported = await window.api.importMedia(filePaths)
                for (const m of imported) addRefImage(m.id)
              }
            }}
            onClick={async () => {
              const paths = await window.api.showOpenDialog({
                title: 'Choose reference images',
                properties: ['openFile', 'multiSelections'],
                filters: [
                  {
                    name: 'Images',
                    extensions: ['png', 'jpg', 'jpeg', 'webp', 'bmp', 'tif', 'tiff']
                  }
                ]
              })
              if (!paths) return
              const imported = await window.api.importMedia(paths)
              for (const m of imported) addRefImage(m.id)
            }}
          >
            {refImagePaths.length === 0 && refImageIds.length === 0 ? (
              <div className="text-sm">Drag images here, or click to browse</div>
            ) : (
              <div className="flex items-center gap-2 overflow-x-auto">
                {refImageIds.map((id, idx) => {
                  const media = libraryItems.find((m) => m.id === id) ?? null
                  return (
                    <div key={id} className="relative">
                      <RefThumb src={media?.thumb_path ?? null} label={`Ref ${idx + 1}`} />
                      <Button
                        type="button"
                        size="icon"
                        variant="secondary"
                        className="absolute -right-2 -top-2 h-6 w-6 rounded-full"
                        onClick={(e) => {
                          e.stopPropagation()
                          removeRefImage(id)
                        }}
                        aria-label="Remove reference"
                      >
                        <X className="size-3" />
                      </Button>
                    </div>
                  )
                })}

                {refImagePaths.map((p, idx) => (
                  <div key={p} className="relative">
                    <RefThumb src={null} label={`Ext ${idx + 1}`} />
                    <Button
                      type="button"
                      size="icon"
                      variant="secondary"
                      className="absolute -right-2 -top-2 h-6 w-6 rounded-full"
                      onClick={(e) => {
                        e.stopPropagation()
                        removeRefImagePath(p)
                      }}
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
            <Select value={String(resolution)} onValueChange={(v) => setResolution(Number(v))}>
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

        <Button
          type="button"
          className="w-full"
          disabled={generateDisabled}
          onClick={async () => {
            const built = buildParams()
            if (!built.params.prompt.trim()) return
            const genId = await window.api.submitGeneration(built)
            try {
              const gen = await window.api.timeline.get(genId)
              if (gen) addGeneration(gen)
            } catch {
              // ignore
            }
          }}
        >
          Generate
        </Button>

        {showQueue ? (
          <Card className="p-3">
            {isModelLoading ? (
              <>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Loading model…</span>
                </div>
                <div className="mt-2">
                  <Progress className="animate-pulse" />
                </div>
              </>
            ) : (
              <>
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
              </>
            )}
            <div className="mt-2 space-y-1">
              {visibleQueueItems.slice(0, 3).map((q) => {
                const generationId = q.correlation_id
                return (
                  <div key={q.id} className="flex items-center justify-between text-xs">
                    <span className="truncate text-muted-foreground">
                      {generations.find((g) => g.id === generationId)?.prompt ??
                        generationId ??
                        q.id}
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
          </Card>
        ) : null}
      </div>
    </div>
  )
}
