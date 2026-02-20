import type { SearchResultModel, ProviderModel } from '../../api/types'
import type { ProviderConfig } from '../provider-config-service'
import {
  asRecord,
  extractRequestBodySchemaFromOpenApi,
  fallbackRequestSchema,
  getString,
  normalizeObjectSchema,
  toOptionalNumber
} from './adapter-utils'

export function normalizeFalSearchResult(raw: unknown, _config: ProviderConfig): SearchResultModel {
  const source = unwrapFalModel(raw) ?? asRecord(raw) ?? {}
  const metadata = asRecord(source.metadata) ?? {}
  const modelId =
    getString(source.endpoint_id) || getString(source.id) || getString(source.model_id) || ''

  return {
    modelId,
    name:
      getString(metadata.display_name) ||
      getString(source.title) ||
      getString(source.name) ||
      modelId,
    description: getString(metadata.description) || getString(source.description) || undefined,
    type:
      getString(metadata.category) ||
      getString(source.category) ||
      getString(source.task) ||
      getString(source.type) ||
      undefined,
    runCount: toOptionalNumber(source.run_count) ?? toOptionalNumber(metadata.run_count) ?? undefined,
    raw
  }
}

export function normalizeFalModelDetail(raw: unknown, config: ProviderConfig): ProviderModel | null {
  const source = unwrapFalModel(raw)
  const model = normalizeFalSearchResult(source ?? raw, config)
  if (!model.modelId) return null

  const requestSchema =
    extractCanonicalSchemaFromOpenApi(source) ?? extractCanonicalSchemaFromOpenApi(raw)

  return {
    modelId: model.modelId,
    name: model.name,
    description: model.description,
    type: model.type,
    providerId: config.providerId,
    requestSchema: requestSchema ?? fallbackRequestSchema()
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

function extractCanonicalSchemaFromOpenApi(raw: unknown) {
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

  return normalizeObjectSchema(selected)
}
