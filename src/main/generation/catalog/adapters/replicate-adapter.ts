import type { CanonicalEndpointDef } from '../../../types'
import type { SearchResultModel, ProviderModel } from '../../api/types'
import type { ProviderConfig } from '../provider-config-service'
import type { AdapterInput } from './adapter-factory'
import {
  asRecord,
  fallbackRequestSchema,
  getString,
  inferModeInfo,
  normalizeObjectSchema,
  resolveSchemaReference,
  toEndpointKey,
  toOptionalNumber
} from './adapter-utils'

export function transformReplicate(input: AdapterInput): CanonicalEndpointDef[] {
  const models = extractModelList(input.rawFeed)

  return models.flatMap((model) => {
    const normalized = normalizeReplicateSearchResult(model, input.providerConfig)
    const slug = normalized.modelId
    if (!slug) return []

    const modeInfo = inferModeInfo(normalized.type, normalized.modelId)

    return [
      {
        endpointKey: toEndpointKey(input.providerConfig.providerId, slug, modeInfo.outputType),
        providerId: input.providerConfig.providerId,
        providerModelId: slug,
        canonicalModelId: undefined,
        displayName: normalized.name,
        modes: modeInfo.modes,
        outputType: modeInfo.outputType,
        executionMode: 'remote-async',
        requestSchema: input.defaultRequestSchema
      }
    ]
  })
}

export function normalizeReplicateSearchResult(
  raw: unknown,
  _config: ProviderConfig
): SearchResultModel {
  const source = asRecord(raw) ?? {}
  const owner = getString(source.owner)
  const name = getString(source.name)
  const slashId = owner && name ? `${owner}/${name}` : null
  const modelId = getString(source.slug) || slashId || getString(source.id) || ''

  return {
    modelId,
    name: getString(source.title) || getString(source.name) || modelId,
    description: getString(source.description) || undefined,
    type: getString(source.type) || getString(source.category) || undefined,
    runCount: toOptionalNumber(source.run_count) ?? undefined,
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

  return {
    modelId: searchResult.modelId,
    name: searchResult.name,
    description: searchResult.description,
    type: searchResult.type,
    providerId: config.providerId,
    requestSchema: inputSchema ?? fallbackRequestSchema()
  }
}

function extractModelList(rawFeed: unknown): unknown[] {
  if (Array.isArray(rawFeed)) return rawFeed

  const source = asRecord(rawFeed)
  if (!source) return []

  if (Array.isArray(source.results)) return source.results
  if (Array.isArray(source.models)) return source.models

  return []
}

function extractReplicateInputSchema(openApiSchema: Record<string, unknown> | null) {
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

  return normalizeObjectSchema(objectSchema)
}
