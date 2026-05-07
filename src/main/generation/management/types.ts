import type { CanonicalRequestSchema, GenerationMode } from '../../types'

export interface SearchResult {
  models: SearchResultModel[]
  hasMore?: boolean
}

export interface SearchResultModel {
  modelId: string
  name: string
  description?: string
  type?: GenerationMode
  modes?: GenerationMode[]
  outputType?: 'image' | 'video'
  runCount?: number
  raw?: unknown
}

export interface ProviderModel {
  modelId: string
  name: string
  description?: string
  type?: GenerationMode
  modes?: GenerationMode[]
  outputType?: 'image' | 'video'
  providerId: string
  requestSchema: CanonicalRequestSchema
  modelIdentityId?: string
}
