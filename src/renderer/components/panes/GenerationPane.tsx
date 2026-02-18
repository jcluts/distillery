import * as React from 'react'

import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { validateFormValues, type FormFieldConfig } from '@/lib/schema-to-form'
import { useGenerationStore } from '@/stores/generation-store'
import { useEngineStore } from '@/stores/engine-store'
import { useModelStore } from '@/stores/model-store'
import { ModelSelector } from '@/components/generation/ModelSelector'
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
  const anyModelReady = Object.values(filesByModelId).some((f) => f.isReady)

  const formValues = useGenerationStore((s) => s.formValues)
  const setFormValue = useGenerationStore((s) => s.setFormValue)
  const setFormValues = useGenerationStore((s) => s.setFormValues)
  const endpointKey = useGenerationStore((s) => s.endpointKey)
  const buildParams = useGenerationStore((s) => s.buildParams)
  const addGeneration = useGenerationStore((s) => s.addGeneration)

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
        <RefImageDropzone />
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
