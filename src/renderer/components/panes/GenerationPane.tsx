import * as React from 'react'

import { Loader2, Wifi } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { validateFormValues, type FormFieldConfig } from '@/lib/schema-to-form'
import { useGenerationStore } from '@/stores/generation-store'
import { useEngineStore } from '@/stores/engine-store'
import { useQueueStore } from '@/stores/queue-store'
import { useModelStore } from '@/stores/model-store'
import { useProviderStore } from '@/stores/provider-store'
import { ModelSelector } from '@/components/generation/ModelSelector'
import { ModeToggle } from '@/components/generation/ModeToggle'
import { RefImageDropzone } from '@/components/generation/RefImageDropzone'
import { SectionLabel } from '@/components/ui/section-label'
import { DynamicForm } from '@/components/generation/DynamicForm'
import { GenerationStatus } from '@/components/generation/GenerationStatus'
import { ModelSetupWizard } from '@/components/panes/ModelSetupWizard'
import type { CanonicalEndpointDef } from '@/types'

export function GenerationPane(): React.JSX.Element {
  const [endpoint, setEndpoint] = React.useState<CanonicalEndpointDef | null>(null)
  const [validationErrors, setValidationErrors] = React.useState<Record<string, string>>({})
  const fieldsRef = React.useRef<FormFieldConfig[]>([])

  const filesByModelId = useModelStore((s) => s.filesByModelId)

  const generationMode = useGenerationStore((s) => s.generationMode)
  const formValues = useGenerationStore((s) => s.formValues)
  const setFormValue = useGenerationStore((s) => s.setFormValue)
  const setFormValues = useGenerationStore((s) => s.setFormValues)
  const endpointKey = useGenerationStore((s) => s.endpointKey)
  const buildParams = useGenerationStore((s) => s.buildParams)
  const addGeneration = useGenerationStore((s) => s.addGeneration)

  const engineState = useEngineStore((s) => s.state)
  const engineCanGenerate = engineState === 'ready' || engineState === 'idle'

  const { activePhase, items: queueItems } = useQueueStore()
  const isGenerating = !!activePhase || queueItems.some((q) => q.status === 'processing')

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

  const isRemoteEndpoint = endpoint?.executionMode === 'remote-async'
  const isLocalEndpoint = endpoint?.providerId === 'local'
  const selectedLocalModelId = isLocalEndpoint ? endpoint?.providerModelId : null
  const selectedLocalModelReady = selectedLocalModelId
    ? (filesByModelId[selectedLocalModelId]?.isReady ?? false)
    : true

  const prompt = typeof formValues.prompt === 'string' ? formValues.prompt : ''
  const generateDisabled = isRemoteEndpoint ? !prompt.trim() : !engineCanGenerate || !prompt.trim()

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

  // Show setup wizard when the selected local model needs to be downloaded
  if (isLocalEndpoint && !selectedLocalModelReady && selectedLocalModelId) {
    return (
      <div className="space-y-4">
        <ModeToggle />
        <ModelSelector />
        <ModelSetupWizard targetModelId={selectedLocalModelId} />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <ModeToggle />

      <ModelSelector />

      {/* Reference images — only shown in image-to-image mode */}
      {(generationMode === 'image-to-image' || generationMode === 'image-to-video') && (
        <div className="space-y-2">
          <SectionLabel>Reference images</SectionLabel>
          <RefImageDropzone />
        </div>
      )}

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
      <Button
        type="button"
        size="lg"
        className="w-full"
        disabled={generateDisabled}
        onClick={handleSubmit}
      >
        {isGenerating ? (
          <>
            <Loader2 className="animate-spin" />
            Generating
          </>
        ) : (
          'Generate'
        )}
      </Button>

      {/* Generation status — local engine state, or API mode indicator */}
      {isRemoteEndpoint ? (
        <ApiModeStatus providerId={endpoint?.providerId} isGenerating={isGenerating} />
      ) : (
        <GenerationStatus />
      )}
    </div>
  )
}

// =============================================================================
// API Mode status indicator
// Shown below the Generate button when a remote API provider is selected.
// =============================================================================

function ApiModeStatus({
  providerId,
  isGenerating
}: {
  providerId?: string
  isGenerating: boolean
}): React.JSX.Element | null {
  const providers = useProviderStore((s) => s.providers)
  const connectionStatus = useProviderStore((s) => s.connectionStatus)
  const hasApiKey = useProviderStore((s) => s.hasApiKey)

  if (!providerId) return null

  const provider = providers.find((p) => p.providerId === providerId)
  const displayName = provider?.displayName ?? providerId
  const connInfo = connectionStatus[providerId]
  const keyPresent = hasApiKey[providerId] ?? false

  if (!isGenerating && !connInfo && !keyPresent) return null

  return (
    <Card className="p-3">
      <div className="flex items-center gap-2">
        <Wifi className="size-3.5 text-muted-foreground shrink-0" />
        <span className="text-xs text-muted-foreground flex-1">
          {isGenerating ? `Sending to ${displayName}…` : `API Mode — ${displayName}`}
        </span>
        {connInfo?.status === 'success' && (
          <Badge variant="secondary" className="text-[10px] px-1.5 text-emerald-600">
            Connected
          </Badge>
        )}
        {connInfo?.status === 'error' && (
          <Badge
            variant="secondary"
            className="text-[10px] px-1.5 border-destructive/20 text-destructive bg-destructive/10"
            title={connInfo.message}
          >
            API Error
          </Badge>
        )}
        {!keyPresent && (
          <Badge variant="secondary" className="text-[10px] px-1.5 text-amber-600">
            No API Key
          </Badge>
        )}
      </div>
    </Card>
  )
}
