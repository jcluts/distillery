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
import { fallbackRequestSchema, normalizeObjectSchema } from './schema-utils'
import type { ProviderAdapter } from './types'

export function normalizeWavespeedSearchResult(
  raw: unknown,
  _config: ProviderConfig
): SearchResultModel {
  const source = asRecord(raw) ?? {}
  const modelId =
    getString(source.id) || getString(source.model_id) || getString(asRecord(source.data)?.id) || ''
  const name = getString(source.name) || getString(source.title) || modelId
  const description = getString(source.description) || undefined
  const rawType = getString(source.type) || getString(source.task_type)
  const type = coerceGenerationMode(rawType)
  const capability = inferModeInfo(rawType ?? undefined, modelId, { name, description })

  return {
    modelId,
    name,
    description,
    type,
    modes: capability.modes,
    outputType: capability.outputType,
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

  const requestSchema = extractWavespeedRequestSchema(source) ?? fallbackRequestSchema()
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

function extractWavespeedRequestSchema(
  model: Record<string, unknown>
): CanonicalRequestSchema | null {
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
