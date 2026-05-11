import {
  asRecord,
  asOptionalNumber,
  coerceGenerationMode,
  getString,
  inferModeInfo
} from '../../param-utils'
import type { SearchResultModel, ProviderModel } from '../../management/types'
import type { ProviderConfig } from '../../catalog/provider-config'
import type { CanonicalRequestSchema } from '../../../types'
import {
  fallbackRequestSchema,
  normalizeObjectSchema,
  resolveSchemaReference
} from './schema-utils'
import type { ProviderAdapter } from './types'

export function normalizeReplicateSearchResult(
  raw: unknown,
  _config: ProviderConfig
): SearchResultModel {
  const source = asRecord(raw) ?? {}
  const owner = getString(source.owner)
  const name = getString(source.name)
  const slashId = owner && name ? `${owner}/${name}` : null
  const modelId = getString(source.slug) || slashId || getString(source.id) || ''
  const displayName = getString(source.title) || getString(source.name) || modelId
  const description = getString(source.description) || undefined
  const rawType = getString(source.type) || getString(source.category)
  const type = coerceGenerationMode(rawType)
  const capability = inferModeInfo(rawType ?? undefined, modelId, {
    name: displayName,
    description
  })

  return {
    modelId,
    name: displayName,
    description,
    type,
    modes: capability.modes,
    outputType: capability.outputType,
    runCount: asOptionalNumber(source.run_count) ?? undefined,
    raw
  }
}

export function normalizeReplicateModelDetail(
  raw: unknown,
  config: ProviderConfig
): ProviderModel | null {
  const source = asRecord(raw)
  if (!source) return null

  const searchResult = normalizeReplicateSearchResult(source, config)
  if (!searchResult.modelId) return null

  const latestVersion = asRecord(source.latest_version)
  const openApiSchema =
    asRecord(source.openapi_schema) ||
    asRecord(source.openapiSchema) ||
    asRecord(latestVersion?.openapi_schema) ||
    asRecord(latestVersion?.openapiSchema)

  const inputSchema = extractReplicateInputSchema(openApiSchema)
  const requestSchema = inputSchema ?? fallbackRequestSchema()
  const capability = inferModeInfo(
    searchResult.outputType === 'video' ? 'video' : searchResult.type,
    searchResult.modelId,
    {
      name: searchResult.name,
      description: searchResult.description,
      requestSchema
    }
  )

  return {
    modelId: searchResult.modelId,
    name: searchResult.name,
    description: searchResult.description,
    type: searchResult.type,
    modes: capability.modes,
    outputType: capability.outputType,
    providerId: config.providerId,
    requestSchema
  }
}

function extractReplicateInputSchema(
  openApiSchema: Record<string, unknown> | null
): CanonicalRequestSchema | null {
  if (!openApiSchema) return null

  const components = asRecord(openApiSchema.components)
  const schemas = asRecord(components?.schemas)
  if (!schemas) return null

  const inputSchema =
    asRecord(schemas.Input) ||
    asRecord(schemas.input) ||
    asRecord(schemas.Inputs) ||
    asRecord(schemas.PredictionRequest)

  if (!inputSchema) {
    return null
  }

  const objectSchema = asRecord(inputSchema.properties)
    ? inputSchema
    : resolveSchemaReference(inputSchema, schemas)

  if (!objectSchema) {
    return null
  }

  return normalizeObjectSchema(objectSchema, schemas)
}

export const replicateAdapter: ProviderAdapter = {
  normalizeSearchResult: normalizeReplicateSearchResult,
  normalizeModelDetail: normalizeReplicateModelDetail
}
