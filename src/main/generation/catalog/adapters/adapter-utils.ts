import type { CanonicalRequestSchema, GenerationMode } from '../../../types'
import { normalizeRequestSchema } from '../schema-normalizer'

export function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object') return null
  return value as Record<string, unknown>
}

export function getString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

export function toOptionalNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

export function prettifyTitle(value: string): string {
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

export function normalizeSchemaType(
  type: string | null
): 'string' | 'number' | 'integer' | 'boolean' | 'array' {
  if (type === 'number' || type === 'integer' || type === 'boolean' || type === 'array') {
    return type
  }
  return 'string'
}

export function toEndpointKey(providerId: string, modelId: string, outputType: 'image' | 'video'): string {
  return `${providerId}.${modelId}.${outputType}`
}

/**
 * Coerce a free-form type/category string from a provider API into a canonical GenerationMode.
 * Returns undefined if the string doesn't map to a known mode.
 */
export function coerceGenerationMode(raw: string | null | undefined): GenerationMode | undefined {
  if (!raw) return undefined
  const haystack = raw.toLowerCase().trim()

  if (haystack === 'text-to-image' || haystack === 'txt2img' || haystack === 't2i') {
    return 'text-to-image'
  }
  if (
    haystack === 'image-to-image' ||
    haystack === 'img2img' ||
    haystack === 'i2i' ||
    haystack === 'edit' ||
    haystack === 'image-editing'
  ) {
    return 'image-to-image'
  }
  if (haystack === 'text-to-video' || haystack === 'txt2vid') {
    return 'text-to-video'
  }
  if (haystack === 'image-to-video' || haystack === 'img2vid') {
    return 'image-to-video'
  }

  // Fuzzy fallbacks
  if (haystack.includes('video')) {
    return haystack.includes('image') ? 'image-to-video' : 'text-to-video'
  }
  if (haystack.includes('edit') || haystack.includes('img2img') || haystack.includes('image-to-image')) {
    return 'image-to-image'
  }
  if (haystack.includes('image') || haystack.includes('generation')) {
    return 'text-to-image'
  }

  return undefined
}

export function inferModeInfo(
  type: GenerationMode | string | undefined,
  modelId: string
): {
  modes: GenerationMode[]
  outputType: 'image' | 'video'
} {
  // If type is already a valid GenerationMode, use it directly
  const coerced = coerceGenerationMode(type)
  if (coerced) {
    const isVideo = coerced === 'text-to-video' || coerced === 'image-to-video'
    return { modes: [coerced], outputType: isVideo ? 'video' : 'image' }
  }

  // Fall back to inferring from model ID
  const haystack = modelId.toLowerCase()

  if (haystack.includes('video')) {
    return {
      modes: haystack.includes('image') ? ['image-to-video'] : ['text-to-video'],
      outputType: 'video'
    }
  }

  return {
    modes: haystack.includes('edit') || haystack.includes('image-to-image')
      ? ['image-to-image']
      : ['text-to-image'],
    outputType: 'image'
  }
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

export function normalizeObjectSchema(schema: Record<string, unknown>) {
  const properties = asRecord(schema.properties)
  if (!properties) {
    return null
  }

  const required = Array.isArray(schema.required)
    ? schema.required.filter((entry): entry is string => typeof entry === 'string')
    : []

  const mappedProperties = Object.fromEntries(
    Object.entries(properties).map(([key, rawProperty]) => {
      const property = asRecord(rawProperty) ?? {}
      const type = normalizeSchemaType(getString(property.type))

      return [
        key,
        {
          type,
          title: getString(property.title) || prettifyTitle(key),
          description: getString(property.description) || undefined,
          default: property.default,
          minimum: toOptionalNumber(property.minimum) ?? undefined,
          maximum: toOptionalNumber(property.maximum) ?? undefined,
          step: toOptionalNumber(property.multipleOf) ?? undefined,
          enum: Array.isArray(property.enum)
            ? property.enum.filter(
                (entry): entry is string | number =>
                  typeof entry === 'string' || typeof entry === 'number'
              )
            : undefined,
          items:
            type === 'array'
              ? {
                  type: normalizeSchemaType(getString(asRecord(property.items)?.type))
                }
              : undefined
        }
      ]
    })
  )

  return normalizeRequestSchema({
    properties: mappedProperties,
    required,
    order: Object.keys(mappedProperties)
  })
}
