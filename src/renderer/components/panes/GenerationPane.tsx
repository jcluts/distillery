import * as React from 'react'
import { X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { validateFormValues, type FormFieldConfig } from '@/lib/schema-to-form'
import { useGenerationStore } from '@/stores/generation-store'
import { useEngineStore } from '@/stores/engine-store'
import { useLibraryStore } from '@/stores/library-store'
import { useModelStore } from '@/stores/model-store'
import { ModelSelector } from '@/components/generation/ModelSelector'
import { SectionLabel } from '@/components/ui/section-label'
import { DynamicForm } from '@/components/generation/DynamicForm'
import { GenerationStatus } from '@/components/generation/GenerationStatus'
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
    <div className="relative overflow-hidden rounded-lg border bg-muted">
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
  const engineCanGenerate = engineState === 'ready' || engineState === 'idle'

  // Fetch the endpoint schema on mount / when endpoint key changes
  React.useEffect(() => {
    let cancelled = false
    window.api.getGenerationEndpointSchema(endpointKey).then((ep) => {
      if (!cancelled && ep) setEndpoint(ep)
    })
    return () => {
      cancelled = true
    }
  }, [endpointKey])

  const prompt = typeof formValues.prompt === 'string' ? formValues.prompt : ''
  const generateDisabled = !engineCanGenerate || !prompt.trim()

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

      {/* Reference images */}
      <div className="space-y-2">
        <SectionLabel>Reference images</SectionLabel>
        <div
          className={cn(
            'rounded-lg border border-dashed bg-background p-3',
            refImagePaths.length === 0 && refImageIds.length === 0 ? 'text-muted-foreground' : ''
          )}
          onDragOver={(e) => e.preventDefault()}
          onDrop={async (e) => {
            e.preventDefault()
            const multiIds = e.dataTransfer.getData('application/x-distillery-media-ids')
            if (multiIds) {
              try {
                const ids = JSON.parse(multiIds) as string[]
                for (const id of ids) addRefImage(id)
              } catch { /* ignore parse error */ }
              return
            }
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
        <SectionLabel>Prompt</SectionLabel>
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
      <Button type="button" className="w-full" disabled={generateDisabled} onClick={handleSubmit}>
        Generate
      </Button>

      {/* Generation status — model load, progress, pending items */}
      <GenerationStatus />
    </div>
  )
}
