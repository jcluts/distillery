import type {
  CanonicalEndpointDef,
  CanonicalGenerationParams,
  GenerationProgressEvent
} from '../../types'

export interface GenerationRequest {
  generationId: string
  endpoint: CanonicalEndpointDef
  params: CanonicalGenerationParams
  refImagePaths: string[]
  outputDir: string
}

export interface GenerationResult {
  success: boolean
  outputs: Array<{ localPath: string; mimeType?: string }>
  metrics?: {
    seed?: number
    totalTimeMs?: number
    promptCacheHit?: boolean
    refLatentCacheHit?: boolean
  }
  error?: string
}

export interface GenerationProvider {
  readonly providerId: string
  readonly executionMode: 'queued-local' | 'remote-async'
  prepare?(): Promise<void>
  execute(request: GenerationRequest): Promise<GenerationResult>
  on?(event: 'progress', listener: (event: GenerationProgressEvent) => void): void
}
