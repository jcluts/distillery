import type { CanonicalRequestSchema, CanonicalSchemaProperty } from '../../../types'
import { asOptionalNumber, asRecord, getString } from '../../param-utils'
import { normalizeRequestSchema } from '../../catalog/schema-normalizer'

function prettifyTitle(value: string): string {
  return value.replace(/[_-]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function normalizeSchemaType(type: string | null): CanonicalSchemaProperty['type'] {
  if (
    type === 'number' ||
    type === 'integer' ||
    type === 'boolean' ||
    type === 'array' ||
    type === 'object'
  ) {
    return type
  }
  return 'string'
}

export function fallbackRequestSchema(): CanonicalRequestSchema {
  return normalizeRequestSchema({
    properties: {
      prompt: {
        type: 'string',
        title: 'Prompt'
      }
    },
    required: ['prompt'],
    order: ['prompt']
  })
}

export function resolveSchemaReference(
  schema: Record<string, unknown>,
  schemas: Record<string, unknown> | null
): Record<string, unknown> | null {
  const ref = getString(schema.$ref)
  if (!ref) return schema

  const prefix = '#/components/schemas/'
  if (!ref.startsWith(prefix) || !schemas) {
    return null
  }

  const schemaName = ref.slice(prefix.length)
  return asRecord(schemas[schemaName])
}

export function extractRequestBodySchemaFromOpenApi(
  openApi: Record<string, unknown>,
  schemas: Record<string, unknown> | null
): Record<string, unknown> | null {
  const paths = asRecord(openApi.paths)
  if (!paths) return null

  for (const pathItem of Object.values(paths)) {
    const operations = asRecord(pathItem)
    if (!operations) continue

    for (const operation of Object.values(operations)) {
      const opRecord = asRecord(operation)
      if (!opRecord) continue

      const requestBody = asRecord(opRecord.requestBody)
      const content = asRecord(requestBody?.content)
      const jsonContent = asRecord(content?.['application/json'])
      const schema = asRecord(jsonContent?.schema)
      if (!schema) continue

      const resolved = resolveSchemaReference(schema, schemas)
      if (resolved) {
        return resolved
      }
    }
  }

  return null
}

export function normalizeObjectSchema(
  schema: Record<string, unknown>,
  schemas: Record<string, unknown> | null = null
): CanonicalRequestSchema | null {
  const properties = asRecord(schema.properties)
  if (!properties) {
    return null
  }

  const required = Array.isArray(schema.required)
    ? schema.required.filter((entry): entry is string => typeof entry === 'string')
    : []

  const mappedProperties = Object.fromEntries(
    Object.entries(properties).map(([key, rawProperty]) => {
      return [key, normalizeJsonSchemaProperty(key, rawProperty, schemas)]
    })
  )

  return normalizeRequestSchema({
    properties: mappedProperties,
    required,
    order: Object.keys(mappedProperties)
  })
}

function normalizeJsonSchemaProperty(
  key: string,
  rawProperty: unknown,
  schemas: Record<string, unknown> | null
): CanonicalSchemaProperty {
  const property = asRecord(rawProperty) ?? {}
  const variants = Array.isArray(property.anyOf)
    ? property.anyOf
        .map((variant) => asRecord(variant))
        .map((variant) => (variant ? resolveSchemaReference(variant, schemas) : null))
        .filter((variant): variant is Record<string, unknown> => !!variant)
    : []

  const objectVariant =
    variants.find(
      (variant) => getString(variant.type) === 'object' && asRecord(variant.properties)
    ) ?? null
  const enumVariant =
    variants.find((variant) => Array.isArray(variant.enum)) ??
    (Array.isArray(property.enum) ? property : null)
  const effective = objectVariant ?? property
  const type = normalizeSchemaType(getString(effective.type))
  const itemSchema = asRecord(effective.items)

  const normalized: CanonicalSchemaProperty = {
    type,
    title: getString(property.title) || getString(effective.title) || prettifyTitle(key),
    description: getString(property.description) || getString(effective.description) || undefined,
    default: property.default ?? effective.default,
    minimum: asOptionalNumber(effective.minimum) ?? undefined,
    maximum: asOptionalNumber(effective.maximum) ?? undefined,
    step: asOptionalNumber(effective.multipleOf) ?? undefined,
    enum: enumVariant
      ? (enumVariant.enum as unknown[]).filter(
          (entry): entry is string | number =>
            typeof entry === 'string' || typeof entry === 'number'
        )
      : undefined,
    items:
      type === 'array'
        ? {
            type: normalizeSchemaType(getString(itemSchema?.type)),
            minItems:
              asOptionalNumber(effective.minItems) ??
              asOptionalNumber(itemSchema?.minItems) ??
              undefined,
            maxItems:
              asOptionalNumber(effective.maxItems) ??
              asOptionalNumber(itemSchema?.maxItems) ??
              undefined
          }
        : undefined
  }

  const properties = asRecord(effective.properties)
  if (type === 'object' && properties) {
    normalized.properties = Object.fromEntries(
      Object.entries(properties).map(([childKey, childProperty]) => [
        childKey,
        normalizeJsonSchemaProperty(childKey, childProperty, schemas)
      ])
    )
  }

  if (isWidthHeightObject(normalized)) {
    const width = normalized.properties?.width
    const height = normalized.properties?.height
    normalized.minimum = Math.max(width?.minimum ?? 1, height?.minimum ?? 1)
    normalized.maximum = Math.min(width?.maximum ?? Infinity, height?.maximum ?? Infinity)
    if (!Number.isFinite(normalized.maximum)) normalized.maximum = undefined
    normalized.ui = { component: 'size-object' }
  }

  return normalized
}

function isWidthHeightObject(property: CanonicalSchemaProperty): boolean {
  return (
    property.type === 'object' &&
    !!property.properties?.width &&
    !!property.properties?.height &&
    (property.properties.width.type === 'integer' || property.properties.width.type === 'number') &&
    (property.properties.height.type === 'integer' || property.properties.height.type === 'number')
  )
}
