import { useMemo, useEffect, useState, useRef } from 'react'
import type { CanonicalEndpointDef } from '@/types'
import {
  schemaToFormFields,
  getDefaultValues,
  type FormFieldConfig,
} from '@/lib/schema-to-form'
import { FormField } from './FormField'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DynamicFormProps {
  endpoint: CanonicalEndpointDef
  values: Record<string, unknown>
  validationErrors?: Record<string, string>
  onChange: (key: string, value: unknown) => void
  onSetDefaults: (defaults: Record<string, unknown>) => void
  onFieldsChange?: (fields: FormFieldConfig[]) => void
  disabled?: boolean
}

// ---------------------------------------------------------------------------
// DynamicForm
// ---------------------------------------------------------------------------

export function DynamicForm({
  endpoint,
  values,
  validationErrors = {},
  onChange,
  onSetDefaults,
  onFieldsChange,
  disabled = false,
}: DynamicFormProps) {
  const [enabledHiddenFields, setEnabledHiddenFields] = useState<Set<string>>(new Set())
  const initializedRef = useRef<string | null>(null)

  // Build field configs from the endpoint schema
  const fields = useMemo<FormFieldConfig[]>(() => {
    const schema = endpoint.requestSchema
    if (!schema?.properties) return []
    return schemaToFormFields(schema.properties, schema.required || [], schema.order)
  }, [endpoint])

  // Reset when endpoint changes
  useEffect(() => {
    setEnabledHiddenFields(new Set())
  }, [endpoint.endpointKey])

  // Set defaults when endpoint changes
  useEffect(() => {
    onFieldsChange?.(fields)

    const hasExistingValues = Object.keys(values).some(
      (key) =>
        values[key] !== undefined &&
        values[key] !== '' &&
        !(Array.isArray(values[key]) && (values[key] as unknown[]).length === 0)
    )

    if (initializedRef.current !== endpoint.endpointKey && !hasExistingValues) {
      const defaults = getDefaultValues(fields)
      onSetDefaults(defaults)
    }
    initializedRef.current = endpoint.endpointKey
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fields, endpoint.endpointKey, onFieldsChange, onSetDefaults])

  const toggleHiddenField = (fieldName: string) => {
    setEnabledHiddenFields((prev) => {
      const next = new Set(prev)
      if (next.has(fieldName)) {
        next.delete(fieldName)
        onChange(fieldName, undefined)
      } else {
        next.add(fieldName)
      }
      return next
    })
  }

  if (fields.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <p className="text-sm">No configurable parameters for this model.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {fields.map((field) => {
        // Hidden fields render as toggle-able sections
        if (field.hidden) {
          const isEnabled = enabledHiddenFields.has(field.name)
          return (
            <div key={field.name} className="space-y-2">
              <div className="space-y-1">
                <button
                  type="button"
                  onClick={() => toggleHiddenField(field.name)}
                  disabled={disabled}
                  className={cn(
                    'flex items-center gap-2 px-2.5 py-1 rounded-md text-xs font-medium transition-colors',
                    'border shadow-sm',
                    isEnabled
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-background hover:bg-muted border-input'
                  )}
                >
                  <div
                    className={cn(
                      'w-2.5 h-2.5 rounded-full border-2 transition-colors',
                      isEnabled
                        ? 'bg-primary-foreground border-primary-foreground'
                        : 'border-muted-foreground'
                    )}
                  />
                  {field.label}
                </button>
                {field.description && !isEnabled && (
                  <p className="text-xs text-muted-foreground">{field.description}</p>
                )}
              </div>
              {isEnabled && (
                <div className="pl-3 border-l-2 border-primary/50 ml-1.5">
                  <FormField
                    field={field}
                    value={values[field.name]}
                    onChange={(value) => onChange(field.name, value)}
                    disabled={disabled}
                    error={validationErrors[field.name]}
                    hideLabel
                  />
                </div>
              )}
            </div>
          )
        }

        // Regular visible fields
        return (
          <FormField
            key={field.name}
            field={field}
            value={values[field.name]}
            onChange={(value) => onChange(field.name, value)}
            disabled={disabled}
            error={validationErrors[field.name]}
          />
        )
      })}
    </div>
  )
}
