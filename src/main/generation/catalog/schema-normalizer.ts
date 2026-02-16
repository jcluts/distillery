import type {
  CanonicalRequestSchema,
  CanonicalSchemaProperty,
  CanonicalUiSchema
} from '../../types'

function normalizeProperty(key: string, input: unknown): CanonicalSchemaProperty {
  const source = (input ?? {}) as Record<string, unknown>
  const type = typeof source.type === 'string' ? source.type : 'string'

  const normalized: CanonicalSchemaProperty = {
    type: ['string', 'number', 'integer', 'boolean', 'array'].includes(type)
      ? (type as CanonicalSchemaProperty['type'])
      : 'string'
  }

  if (typeof source.title === 'string') normalized.title = source.title
  if (typeof source.description === 'string') normalized.description = source.description
  if ('default' in source) normalized.default = source.default
  if (typeof source.minimum === 'number') normalized.minimum = source.minimum
  if (typeof source.maximum === 'number') normalized.maximum = source.maximum
  if (typeof source.step === 'number') normalized.step = source.step

  if (Array.isArray(source.enum)) {
    normalized.enum = source.enum.filter(
      (value): value is string | number => typeof value === 'string' || typeof value === 'number'
    )
  }

  if (type === 'array') {
    const items = source.items as Record<string, unknown> | undefined
    normalized.items = {
      type: typeof items?.type === 'string' ? items.type : 'string',
      minItems: typeof items?.minItems === 'number' ? items.minItems : undefined,
      maxItems: typeof items?.maxItems === 'number' ? items.maxItems : undefined
    }
  }

  const ui = source.ui as Record<string, unknown> | undefined
  if (ui) {
    normalized.ui = {
      component: typeof ui.component === 'string' ? ui.component : undefined,
      placeholder: typeof ui.placeholder === 'string' ? ui.placeholder : undefined,
      hidden: typeof ui.hidden === 'boolean' ? ui.hidden : undefined,
      hideLabel: typeof ui.hideLabel === 'boolean' ? ui.hideLabel : undefined,
      transformMap:
        ui.transformMap && typeof ui.transformMap === 'object'
          ? (ui.transformMap as Record<string, unknown>)
          : undefined
    }
  }

  if (!normalized.title) {
    normalized.title = key
      .split('_')
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ')
  }

  return normalized
}

export function normalizeRequestSchema(input: unknown): CanonicalRequestSchema {
  const source = (input ?? {}) as Record<string, unknown>
  const propertiesSource = (source.properties ?? {}) as Record<string, unknown>

  const properties = Object.entries(propertiesSource).reduce<Record<string, CanonicalSchemaProperty>>(
    (acc, [key, value]) => {
      acc[key] = normalizeProperty(key, value)
      return acc
    },
    {}
  )

  const required = Array.isArray(source.required)
    ? source.required.filter((value): value is string => typeof value === 'string')
    : undefined

  const order = Array.isArray(source.order)
    ? source.order.filter((value): value is string => typeof value === 'string')
    : undefined

  return {
    properties,
    required,
    order
  }
}

export function normalizeUiSchema(input: unknown): CanonicalUiSchema | undefined {
  if (!input || typeof input !== 'object') return undefined

  const source = input as Record<string, unknown>
  const groupsSource = Array.isArray(source.groups) ? source.groups : undefined
  const controlsSource = source.controls as Record<string, unknown> | undefined

  const groups = groupsSource
    ? groupsSource.reduce<Array<{ id: string; label: string; order?: number }>>((acc, group) => {
      const item = group as Record<string, unknown>
      if (typeof item.id !== 'string' || typeof item.label !== 'string') return acc

      acc.push({
        id: item.id,
        label: item.label,
        order: typeof item.order === 'number' ? item.order : undefined
      })

      return acc
    }, [])
    : undefined

  const controls = controlsSource
    ? Object.entries(controlsSource).reduce<
        Record<string, { group?: string; order?: number; graphical?: boolean }>
      >((acc, [key, value]) => {
        const control = value as Record<string, unknown>
        acc[key] = {
          group: typeof control.group === 'string' ? control.group : undefined,
          order: typeof control.order === 'number' ? control.order : undefined,
          graphical: typeof control.graphical === 'boolean' ? control.graphical : undefined
        }
        return acc
      }, {})
    : undefined

  if (!groups && !controls) return undefined

  return {
    groups,
    controls
  }
}
