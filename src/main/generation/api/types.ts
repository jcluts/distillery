import type { CanonicalRequestSchema, GenerationMode, GenerationOutputArtifact } from '../../types'

export interface SearchResult {
  models: SearchResultModel[]
  hasMore?: boolean
}

export interface SearchResultModel {
  modelId: string
  name: string
  description?: string
  type?: GenerationMode
  runCount?: number
  raw?: unknown
}

export interface ProviderModel {
  modelId: string
  name: string
  description?: string
  type?: GenerationMode
  providerId: string
  requestSchema: CanonicalRequestSchema
  modelIdentityId?: string
}

export interface GenerationResult {
  success: boolean
  outputs: GenerationOutputArtifact[]
  error?: string
  metrics?: {
    seed?: number
    totalTimeMs?: number
    promptCacheHit?: boolean
    refLatentCacheHit?: boolean
  }
}
