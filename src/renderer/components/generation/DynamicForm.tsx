import * as React from 'react'
import { useMemo, useEffect, useRef } from 'react'
import { ChevronRight } from 'lucide-react'
import type { CanonicalEndpointDef } from '@/types'
import { schemaToFormFields, getDefaultValues, type FormFieldConfig } from '@/lib/schema-to-form'
import { FormField } from './FormField'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
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
  disabled = false
}: DynamicFormProps): React.JSX.Element {
  const initializedRef = useRef<string | null>(null)

  // Build field configs from the endpoint schema
  const fields = useMemo<FormFieldConfig[]>(() => {
    const schema = endpoint.requestSchema
    if (!schema?.properties) return []
    return schemaToFormFields(schema.properties, schema.required || [], schema.order)
  }, [endpoint])

  // Split into visible and hidden (advanced) fields
  const { visibleFields, advancedFields } = useMemo(() => {
    const visible: FormFieldConfig[] = []
    const advanced: FormFieldConfig[] = []
    for (const field of fields) {
      if (field.hidden) {
        advanced.push(field)
      } else {
        visible.push(field)
      }
    }
    return { visibleFields: visible, advancedFields: advanced }
  }, [fields])

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

  if (fields.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <p className="text-sm">No configurable parameters for this model.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {visibleFields.map((field) => (
        <FormField
          key={field.name}
          field={field}
          value={values[field.name]}
          onChange={(value) => onChange(field.name, value)}
          disabled={disabled}
          error={validationErrors[field.name]}
        />
      ))}

      {advancedFields.length > 0 && (
        <Collapsible defaultOpen={false}>
          <CollapsibleTrigger
            disabled={disabled}
            className={cn(
              'flex w-full items-center gap-1.5 py-1 text-xs text-muted-foreground',
              'hover:text-foreground transition-colors',
              '[&[data-state=open]>svg]:rotate-90'
            )}
          >
            <ChevronRight className="size-3.5 transition-transform duration-200" />
            Advanced
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="space-y-4 pt-2">
              {advancedFields.map((field) => (
                <FormField
                  key={field.name}
                  field={field}
                  value={values[field.name]}
                  onChange={(value) => onChange(field.name, value)}
                  disabled={disabled}
                  error={validationErrors[field.name]}
                />
              ))}
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  )
}
