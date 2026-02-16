// =============================================================================
// Schema-to-Form — Converts CanonicalRequestSchema into form field configs
// Adapted from Wavespeed Desktop's schemaToForm.ts for Distillery's canonical
// schema types.
// =============================================================================

import type { CanonicalSchemaProperty } from '../types'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type FormFieldType =
  | 'text'
  | 'textarea'
  | 'number'
  | 'slider'
  | 'boolean'
  | 'select'
  | 'size'
  | 'local-size'

export interface FormFieldConfig {
  name: string
  type: FormFieldType
  label: string
  required: boolean
  default?: unknown
  min?: number
  max?: number
  step?: number
  options?: (string | number)[]
  description?: string
  placeholder?: string
  hidden?: boolean
  hideLabel?: boolean
}

// Fields that should render as textarea
const TEXTAREA_FIELDS = ['prompt', 'negative_prompt']

// Internal fields that should never appear in the form
const INTERNAL_FIELDS = ['ref_image_ids', 'ref_image_paths']

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Convert canonical schema properties into an ordered list of form field configs.
 */
export function schemaToFormFields(
  properties: Record<string, CanonicalSchemaProperty>,
  required: string[] = [],
  order?: string[]
): FormFieldConfig[] {
  const fields: FormFieldConfig[] = []

  for (const [name, prop] of Object.entries(properties)) {
    // Skip fields marked as internal via ui.component
    if (prop.ui?.component === 'internal' || INTERNAL_FIELDS.includes(name)) {
      continue
    }

    const field = propertyToField(name, prop, required.includes(name))
    if (field) {
      fields.push(field)
    }
  }

  // Sort by explicit order, then required-first, then alphabetically
  if (order && order.length > 0) {
    return fields.sort((a, b) => {
      const idxA = order.indexOf(a.name)
      const idxB = order.indexOf(b.name)
      const orderA = idxA === -1 ? Infinity : idxA
      const orderB = idxB === -1 ? Infinity : idxB
      return orderA - orderB
    })
  }

  return fields.sort((a, b) => {
    if (a.required !== b.required) return a.required ? -1 : 1
    if (a.name === 'prompt') return -1
    if (b.name === 'prompt') return 1
    return a.name.localeCompare(b.name)
  })
}

/**
 * Extract default values for all fields.
 */
export function getDefaultValues(fields: FormFieldConfig[]): Record<string, unknown> {
  const defaults: Record<string, unknown> = {}

  for (const field of fields) {
    if (field.default !== undefined) {
      defaults[field.name] = field.default
    } else if (field.type === 'boolean') {
      defaults[field.name] = false
    }
  }

  return defaults
}

/**
 * Validate form values against field configs. Returns a map of field name → error message.
 */
export function validateFormValues(
  fields: FormFieldConfig[],
  values: Record<string, unknown>
): Record<string, string> {
  const errors: Record<string, string> = {}

  for (const field of fields) {
    const value = values[field.name]
    const isEmpty =
      value === undefined || value === null || value === ''

    if (field.required && isEmpty) {
      errors[field.name] = `${field.label} is required`
      continue
    }
    if (isEmpty) continue

    if (field.type === 'number' || field.type === 'slider') {
      const num = Number(value)
      if (Number.isNaN(num)) {
        errors[field.name] = `${field.label} must be a number`
        continue
      }
      if (field.min !== undefined && num < field.min) {
        errors[field.name] = `${field.label} must be at least ${field.min}`
      } else if (field.max !== undefined && num > field.max) {
        errors[field.name] = `${field.label} must be at most ${field.max}`
      }
    }

    if (field.type === 'size' || field.type === 'local-size') {
      const raw = String(value)
      const parts = raw.split('*')
      const w = Number(parts[0])
      const h = Number(parts[1])
      if (parts.length !== 2 || Number.isNaN(w) || Number.isNaN(h)) {
        errors[field.name] = `${field.label} must be in WIDTH*HEIGHT format`
      } else if (
        (field.min !== undefined && (w < field.min || h < field.min)) ||
        (field.max !== undefined && (w > field.max || h > field.max))
      ) {
        errors[field.name] = `Dimensions must be between ${field.min} and ${field.max}`
      }
    }
  }

  return errors
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

function propertyToField(
  name: string,
  prop: CanonicalSchemaProperty,
  required: boolean
): FormFieldConfig | null {
  const baseField = {
    name,
    label: prop.title || formatLabel(name),
    required: prop.ui?.hidden ? false : required,
    default: prop.default,
    description: prop.description,
    hidden: !!prop.ui?.hidden,
    hideLabel: !!prop.ui?.hideLabel,
  }

  // Local size component (resolution + aspect ratio selectors)
  if (prop.ui?.component === 'local-size') {
    return {
      ...baseField,
      type: 'local-size',
      min: prop.minimum,
      max: prop.maximum,
    }
  }

  // Generic size component (width/height inputs)
  if (prop.ui?.component === 'size' || (name === 'size' && prop.type === 'string')) {
    return {
      ...baseField,
      type: 'size',
      min: prop.minimum,
      max: prop.maximum,
    }
  }

  // Enum → select
  if (prop.enum && prop.enum.length > 0) {
    return {
      ...baseField,
      type: 'select',
      options: prop.enum,
    }
  }

  // Explicit slider
  if (prop.ui?.component === 'slider') {
    return {
      ...baseField,
      type: 'slider',
      min: prop.minimum,
      max: prop.maximum,
      step: prop.step,
    }
  }

  switch (prop.type) {
    case 'string':
      return {
        ...baseField,
        type: TEXTAREA_FIELDS.some((f) => name.toLowerCase().includes(f)) ? 'textarea' : 'text',
        placeholder: prop.ui?.placeholder,
      }

    case 'integer':
    case 'number':
      return {
        ...baseField,
        type: 'number',
        min: prop.minimum,
        max: prop.maximum,
        step: prop.step,
      }

    case 'boolean':
      return {
        ...baseField,
        type: 'boolean',
      }

    default:
      return {
        ...baseField,
        type: 'text',
      }
  }
}

function formatLabel(name: string): string {
  return name
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}
