import type { CanonicalRequestSchema } from '../../../types'
import { asOptionalNumber, asRecord, getString } from '../../param-utils'
import { normalizeRequestSchema } from '../../catalog/schema-normalizer'

function prettifyTitle(value: string): string {
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function normalizeSchemaType(
  type: string | null
): 'string' | 'number' | 'integer' | 'boolean' | 'array' {
  if (type === 'number' || type === 'integer' || type === 'boolean' || type === 'array') {
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
  schema: Record<string, unknown>
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
      const property = asRecord(rawProperty) ?? {}
      const type = normalizeSchemaType(getString(property.type))

      return [
        key,
        {
          type,
          title: getString(property.title) || prettifyTitle(key),
          description: getString(property.description) || undefined,
          default: property.default,
          minimum: asOptionalNumber(property.minimum) ?? undefined,
          maximum: asOptionalNumber(property.maximum) ?? undefined,
          step: asOptionalNumber(property.multipleOf) ?? undefined,
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
