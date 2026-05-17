// =============================================================================
// Schema-to-Form — Converts CanonicalRequestSchema into form field configs
// =============================================================================

import type { CanonicalSchemaProperty } from '@/types'

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
  | 'size-object'
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

// Fields rendered as textarea
const TEXTAREA_FIELDS = ['prompt', 'negative_prompt']

// Internal fields never shown in the form — handled by the ref image pipeline
const INTERNAL_FIELDS = new Set([
  'model',
  'modelId',
  'ref_image_ids',
  'ref_image_paths',
  'image',
  'images',
  'image_url',
  'image_urls',
  'init_image',
  'init_image_url',
  'input_image',
  'input_image_url',
  'image_input',
  'input_urls',
  'seedImage',
  'first_frame_url',
  'last_frame_url',
  'reference_image',
  'reference_images',
  'ref_images',
  'inputs.referenceImages',
  'inputs.frameImages',
  'inputs.video',
  'mask',
  'mask_image',
  'mask_url',
  'mask_image_url'
])

// Fields managed by the pane directly (not the dynamic form)
const PANE_MANAGED_FIELDS = new Set(['prompt'])

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function schemaToFormFields(
  properties: Record<string, CanonicalSchemaProperty>,
  required: string[] = [],
  order?: string[]
): FormFieldConfig[] {
  const fields: FormFieldConfig[] = []

  for (const [name, prop] of Object.entries(properties)) {
    if (
      prop.ui?.component === 'internal' ||
      INTERNAL_FIELDS.has(name) ||
      PANE_MANAGED_FIELDS.has(name)
    ) {
      continue
    }
    const field = propertyToField(name, prop, required.includes(name))
    if (field) fields.push(field)
  }

  if (order?.length) {
    return fields.sort((a, b) => {
      const idxA = order.indexOf(a.name)
      const idxB = order.indexOf(b.name)
      return (idxA === -1 ? Infinity : idxA) - (idxB === -1 ? Infinity : idxB)
    })
  }

  return fields.sort((a, b) => {
    if (a.required !== b.required) return a.required ? -1 : 1
    return a.name.localeCompare(b.name)
  })
}

export function getDefaultValues(fields: FormFieldConfig[]): Record<string, unknown> {
  const defaults: Record<string, unknown> = {}
  for (const field of fields) {
    if (field.default !== undefined) defaults[field.name] = field.default
    else if (field.type === 'local-size' || field.type === 'size')
      defaults[field.name] = '1024*1024'
    else if (field.type === 'boolean') defaults[field.name] = false
  }
  return defaults
}

export function validateFormValues(
  fields: FormFieldConfig[],
  values: Record<string, unknown>
): Record<string, string> {
  const errors: Record<string, string> = {}

  for (const field of fields) {
    const value = values[field.name]
    const isEmpty = value === undefined || value === null || value === ''

    if (field.required && isEmpty) {
      errors[field.name] = `${field.label} is required`
      continue
    }
    if (isEmpty) continue

    if (field.type === 'number' || field.type === 'slider') {
      const num = Number(value)
      if (Number.isNaN(num)) {
        errors[field.name] = `${field.label} must be a number`
      } else if (field.min !== undefined && num < field.min) {
        errors[field.name] = `${field.label} must be at least ${field.min}`
      } else if (field.max !== undefined && num > field.max) {
        errors[field.name] = `${field.label} must be at most ${field.max}`
      }
    }

    if (field.type === 'size' || field.type === 'local-size' || field.type === 'size-object') {
      const parsed = parseFieldDimensions(value)
      if (!parsed) {
        errors[field.name] = `${field.label} must include width and height`
      } else if (
        (field.min !== undefined && (parsed.w < field.min || parsed.h < field.min)) ||
        (field.max !== undefined && (parsed.w > field.max || parsed.h > field.max))
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
  const base: Omit<FormFieldConfig, 'type'> = {
    name,
    label: prop.title || formatLabel(name),
    required: prop.ui?.hidden ? false : required,
    default: prop.default,
    description: prop.description,
    hidden: !!prop.ui?.hidden,
    hideLabel: !!prop.ui?.hideLabel
  }

  const dimensionConstraints = inferDimensionConstraints(name, prop)

  if (prop.ui?.component === 'local-size') {
    return { ...base, type: 'local-size', ...dimensionConstraints }
  }

  if (prop.ui?.component === 'size-object') {
    return { ...base, type: 'size-object', min: prop.minimum, max: prop.maximum }
  }

  if (prop.ui?.component === 'size' || isPixelSizeField(name, prop)) {
    return { ...base, type: 'local-size', ...dimensionConstraints }
  }

  if (prop.enum?.length) {
    return { ...base, type: 'select', options: prop.enum }
  }

  if (prop.ui?.component === 'slider') {
    return { ...base, type: 'slider', min: prop.minimum, max: prop.maximum, step: prop.step }
  }

  switch (prop.type) {
    case 'string':
      return {
        ...base,
        type: TEXTAREA_FIELDS.some((f) => name.toLowerCase().includes(f)) ? 'textarea' : 'text',
        placeholder: prop.ui?.placeholder
      }
    case 'integer':
    case 'number':
      return { ...base, type: 'number', min: prop.minimum, max: prop.maximum, step: prop.step }
    case 'boolean':
      return { ...base, type: 'boolean' }
    case 'object':
      return { ...base, type: 'text' }
    default:
      return { ...base, type: 'text' }
  }
}

function isPixelSizeField(name: string, prop: CanonicalSchemaProperty): boolean {
  if (prop.type !== 'string' || prop.enum?.length) return false

  const normalizedName = name.toLowerCase()
  return (
    normalizedName === 'size' ||
    normalizedName === 'image_size' ||
    normalizedName === 'output_size' ||
    normalizedName === 'resolution_size'
  )
}

function inferDimensionConstraints(
  name: string,
  prop: CanonicalSchemaProperty
): Pick<FormFieldConfig, 'min' | 'max' | 'step'> {
  const inferred = inferDimensionConstraintsFromDescription(prop.description)
  const step = prop.step ?? (isDimensionFieldName(name) ? 16 : undefined)

  return {
    min: prop.minimum ?? inferred.min,
    max: prop.maximum ?? inferred.max,
    step
  }
}

function inferDimensionConstraintsFromDescription(
  description: string | undefined
): Pick<FormFieldConfig, 'min' | 'max'> {
  if (!description) return {}

  const lower = description.toLowerCase()
  const range = lower.match(/range:\s*(\d+)\s*[-–]\s*(\d+)\s*per dimension/)
  if (!range) return {}

  return {
    min: Number(range[1]),
    max: Number(range[2])
  }
}

function isDimensionFieldName(name: string): boolean {
  const normalized = name.toLowerCase()
  return normalized === 'width' || normalized === 'height'
}

function parseFieldDimensions(value: unknown): { w: number; h: number } | null {
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    const w = Number(record.width)
    const h = Number(record.height)
    return Number.isFinite(w) && Number.isFinite(h) ? { w, h } : null
  }

  if (typeof value === 'string') {
    const parts = value.includes('*') ? value.split('*') : value.toLowerCase().split('x')
    const w = Number(parts[0])
    const h = Number(parts[1])
    return parts.length === 2 && Number.isFinite(w) && Number.isFinite(h) ? { w, h } : null
  }

  return null
}

function formatLabel(name: string): string {
  return name
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}
