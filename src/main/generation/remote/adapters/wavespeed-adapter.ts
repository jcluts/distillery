import { asRecord, asOptionalNumber, coerceGenerationMode, getString } from '../../param-utils'
import type { SearchResultModel, ProviderModel } from '../../management/types'
import type { ProviderConfig } from '../../catalog/provider-config'
import { fallbackRequestSchema, normalizeObjectSchema } from './schema-utils'
import type { ProviderAdapter } from './types'

export function normalizeWavespeedSearchResult(
  raw: unknown,
  _config: ProviderConfig
): SearchResultModel {
  const source = asRecord(raw) ?? {}
  const modelId = getString(source.id) || getString(source.model_id) || getString(asRecord(source.data)?.id) || ''

  return {
    modelId,
    name: getString(source.name) || getString(source.title) || modelId,
    description: getString(source.description) || undefined,
    type: coerceGenerationMode(getString(source.type) || getString(source.task_type)),
    runCount: asOptionalNumber(source.run_count) ?? undefined,
    raw
  }
}

export function normalizeWavespeedModelDetail(
  raw: unknown,
  config: ProviderConfig
): ProviderModel | null {
  const source = asRecord(raw)
  if (!source) return null

  const searchResult = normalizeWavespeedSearchResult(source, config)
  if (!searchResult.modelId) return null

  const requestSchema = extractWavespeedRequestSchema(source)

  return {
    modelId: searchResult.modelId,
    name: searchResult.name,
    description: searchResult.description,
    type: searchResult.type,
    providerId: config.providerId,
    requestSchema: requestSchema ?? fallbackRequestSchema()
  }
}

function extractWavespeedRequestSchema(model: Record<string, unknown>) {
  const apiSchema = asRecord(model.api_schema)
  const schemaList = Array.isArray(apiSchema?.api_schemas) ? apiSchema.api_schemas : []

  for (const entry of schemaList) {
    const requestSchema = asRecord(asRecord(entry)?.request_schema)
    if (!requestSchema) continue

    const normalized = normalizeObjectSchema(requestSchema)
    if (normalized) {
      return normalized
    }
  }

  return null
}

export const wavespeedAdapter: ProviderAdapter = {
  normalizeSearchResult: normalizeWavespeedSearchResult,
  normalizeModelDetail: normalizeWavespeedModelDetail
}
