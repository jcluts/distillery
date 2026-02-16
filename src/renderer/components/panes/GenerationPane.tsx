import * as React from 'react'
import { X } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { validateFormValues, type FormFieldConfig } from '@/lib/schema-to-form'
import { useGenerationStore } from '@/stores/generation-store'
import { useEngineStore } from '@/stores/engine-store'
import { useQueueStore } from '@/stores/queue-store'
import { useLibraryStore } from '@/stores/library-store'
import { useModelStore } from '@/stores/model-store'
import { ModelSelector } from '@/components/generation/ModelSelector'
import { DynamicForm } from '@/components/generation/DynamicForm'
import { ModelSetupWizard } from '@/components/panes/ModelSetupWizard'
import type { CanonicalEndpointDef } from '@/types'

function extractDroppedFilePaths(e: React.DragEvent): string[] {
  type ElectronLikeFile = File & { path?: string }
  const files = Array.from(e.dataTransfer.files ?? [])
  return files
    .map((f) => (f as ElectronLikeFile).path)
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

export function GenerationPane(): React.JSX.Element {
  const [isUnloadingModel, setIsUnloadingModel] = React.useState(false)
  const [endpoint, setEndpoint] = React.useState<CanonicalEndpointDef | null>(null)
  const [validationErrors, setValidationErrors] = React.useState<Record<string, string>>({})
  const fieldsRef = React.useRef<FormFieldConfig[]>([])

  const filesByModelId = useModelStore((s) => s.filesByModelId)
  const anyModelReady = Object.values(filesByModelId).some((f) => f.isReady)

  const formValues = useGenerationStore((s) => s.formValues)
  const setFormValue = useGenerationStore((s) => s.setFormValue)
  const setFormValues = useGenerationStore((s) => s.setFormValues)
  const endpointKey = useGenerationStore((s) => s.endpointKey)
  const refImageIds = useGenerationStore((s) => s.refImageIds)
  const addRefImage = useGenerationStore((s) => s.addRefImage)
  const removeRefImage = useGenerationStore((s) => s.removeRefImage)
  const refImagePaths = useGenerationStore((s) => s.refImagePaths)
  const removeRefImagePath = useGenerationStore((s) => s.removeRefImagePath)
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

  // Fetch the endpoint schema on mount / when endpoint key changes
  React.useEffect(() => {
    let cancelled = false
    window.api.getGenerationEndpointSchema(endpointKey).then((ep) => {
      if (!cancelled && ep) setEndpoint(ep)
    })
    return () => { cancelled = true }
  }, [endpointKey])

  const prompt = typeof formValues.prompt === 'string' ? formValues.prompt : ''
  const generateDisabled = !engineCanGenerate || !prompt.trim()

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

  // Callbacks for DynamicForm
  const handleFieldChange = React.useCallback(
    (key: string, value: unknown) => {
      setFormValue(key, value)
      setValidationErrors((prev) => {
        if (!prev[key]) return prev
        const next = { ...prev }
        delete next[key]
        return next
      })
    },
    [setFormValue]
  )

  const handleSetDefaults = React.useCallback(
    (defaults: Record<string, unknown>) => {
      setFormValues(defaults)
    },
    [setFormValues]
  )

  const handleFieldsChange = React.useCallback((fields: FormFieldConfig[]) => {
    fieldsRef.current = fields
  }, [])

  const handleSubmit = React.useCallback(async () => {
    // Validate
    const errors = validateFormValues(fieldsRef.current, formValues)
    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors)
      return
    }

    const built = buildParams()
    if (!built.params.prompt?.trim()) return

    const genId = await window.api.submitGeneration(built)
    try {
      const gen = await window.api.timeline.get(genId)
      if (gen) addGeneration(gen)
    } catch {
      // ignore
    }
  }, [formValues, buildParams, addGeneration])

  if (!anyModelReady) {
    return (
      <div className="space-y-4">
        <ModelSetupWizard />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <ModelSelector />

      {/* Engine status */}
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

{/* Reference images */}
      <div className="space-y-2">
        <div className="text-xs text-muted-foreground">Reference images</div>
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

      {/* Prompt */}
      <div className="space-y-2">
        <div className="text-xs text-muted-foreground">Prompt</div>
        <Textarea
          data-focus-prompt="true"
          placeholder="Describe what you want to generate…"
          value={prompt}
          onChange={(e) => setFormValue('prompt', e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
              e.preventDefault()
              handleSubmit()
            }
          }}
          rows={3}
          className="resize-none text-sm"
        />
        {validationErrors.prompt && (
          <p className="text-xs text-destructive">{validationErrors.prompt}</p>
        )}
      </div>

      {/* Dynamic form — size, steps, guidance, etc. */}
      {endpoint ? (
        <DynamicForm
          endpoint={endpoint}
          values={formValues}
          validationErrors={validationErrors}
          onChange={handleFieldChange}
          onSetDefaults={handleSetDefaults}
          onFieldsChange={handleFieldsChange}
          disabled={false}
        />
      ) : (
        <div className="py-4 text-center text-sm text-muted-foreground">Loading schema…</div>
      )}

      

      {/* Generate button */}
      <Button
        type="button"
        className="w-full"
        disabled={generateDisabled}
        onClick={handleSubmit}
      >
        Generate
      </Button>

      {/* Queue / progress */}
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
        </Card>
      ) : null}
    </div>
  )
}
