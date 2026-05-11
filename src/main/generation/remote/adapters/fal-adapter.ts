import {
  asRecord,
  asOptionalNumber,
  coerceGenerationMode,
  getString,
  inferModeInfo
} from '../../param-utils'
import type { SearchResultModel, ProviderModel } from '../../management/types'
import type { CanonicalRequestSchema } from '../../../types'
import type { ProviderConfig } from '../../catalog/provider-config'
import {
  extractRequestBodySchemaFromOpenApi,
  fallbackRequestSchema,
  normalizeObjectSchema
} from './schema-utils'
import type { ProviderAdapter } from './types'

export function normalizeFalSearchResult(raw: unknown, _config: ProviderConfig): SearchResultModel {
  const source = unwrapFalModel(raw) ?? asRecord(raw) ?? {}
  const metadata = asRecord(source.metadata) ?? {}
  const modelId =
    getString(source.endpoint_id) || getString(source.id) || getString(source.model_id) || ''
  const name =
    getString(metadata.display_name) || getString(source.title) || getString(source.name) || modelId
  const description = getString(metadata.description) || getString(source.description) || undefined
  const rawType =
    getString(metadata.category) ||
    getString(source.category) ||
    getString(source.task) ||
    getString(source.type)
  const type = coerceGenerationMode(rawType)
  const capability = inferModeInfo(rawType ?? undefined, modelId, { name, description })

  return {
    modelId,
    name,
    description,
    type,
    modes: capability.modes,
    outputType: capability.outputType,
    runCount:
      asOptionalNumber(source.run_count) ?? asOptionalNumber(metadata.run_count) ?? undefined,
    raw
  }
}

export function normalizeFalModelDetail(
  raw: unknown,
  config: ProviderConfig
): ProviderModel | null {
  const source = unwrapFalModel(raw)
  const model = normalizeFalSearchResult(source ?? raw, config)
  if (!model.modelId) return null

  const requestSchema =
    extractCanonicalSchemaFromOpenApi(source) ?? extractCanonicalSchemaFromOpenApi(raw)
  const normalizedSchema = requestSchema ?? fallbackRequestSchema()
  const capability = inferModeInfo(
    model.outputType === 'video' ? 'video' : model.type,
    model.modelId,
    {
      name: model.name,
      description: model.description,
      requestSchema: normalizedSchema
    }
  )

  return {
    modelId: model.modelId,
    name: model.name,
    description: model.description,
    type: model.type,
    modes: capability.modes,
    outputType: capability.outputType,
    providerId: config.providerId,
    requestSchema: normalizedSchema
  }
}

function unwrapFalModel(raw: unknown): Record<string, unknown> | null {
  const source = asRecord(raw)
  if (!source) return null

  if (Array.isArray(source.models)) {
    const first = asRecord(source.models[0])
    if (first) return first
  }

  if (Array.isArray(source.data)) {
    const first = asRecord(source.data[0])
    if (first) return first
  }

  const dataRecord = asRecord(source.data)
  if (dataRecord) {
    return dataRecord
  }

  return source
}

function extractCanonicalSchemaFromOpenApi(raw: unknown): CanonicalRequestSchema | null {
  const source = asRecord(raw)
  if (!source) {
    return null
  }

  const openApi =
    asRecord(source.openapi) ||
    asRecord(source.openapi_3_0) ||
    asRecord(source.openapiSchema) ||
    asRecord(source['openapi-3.0'])

  if (!openApi) {
    return null
  }

  const components = asRecord(openApi.components)
  const schemas = asRecord(components?.schemas)

  const explicitInputSchema =
    asRecord(schemas?.Input) ||
    asRecord(schemas?.input) ||
    asRecord(schemas?.Request) ||
    asRecord(schemas?.GenerationInput)

  const requestBodySchema = extractRequestBodySchemaFromOpenApi(openApi, schemas)
  const selected = explicitInputSchema ?? requestBodySchema
  if (!selected) {
    return null
  }

  return normalizeObjectSchema(selected, schemas)
}

export const falAdapter: ProviderAdapter = {
  normalizeSearchResult: normalizeFalSearchResult,
  normalizeModelDetail: normalizeFalModelDetail
}
