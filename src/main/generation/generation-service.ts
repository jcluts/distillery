import { EventEmitter } from 'events'
import { v4 as uuidv4 } from 'uuid'
import Database from 'better-sqlite3'
import * as generationRepo from '../db/repositories/generations'
import type {
  CanonicalGenerationParams,
  CanonicalEndpointDef,
  GenerationParams,
  GenerationProgressEvent,
  GenerationRecord,
  GenerationSubmitInput
} from '../types'
import { WorkQueueManager } from '../queue/work-queue-manager'
import { WORK_TASK_TYPES } from '../queue/work-task-types'
import { GenerationIOService } from './generation-io-service'
import { ProviderCatalogService } from './catalog/provider-catalog-service'
import { RemoteApiProvider } from './providers/remote-api-provider'

interface GenerationServiceDeps {
  db: Database.Database
  workQueueManager: WorkQueueManager
  generationIOService: GenerationIOService
  providerCatalogService: ProviderCatalogService
  remoteApiProvider: RemoteApiProvider
}

interface QueuedLocalTaskPayload {
  generationId: string
  endpointKey: string
  params: CanonicalGenerationParams
}

export class GenerationService extends EventEmitter {
  private db: Database.Database
  private workQueueManager: WorkQueueManager
  private generationIOService: GenerationIOService
  private providerCatalogService: ProviderCatalogService
  private remoteApiProvider: RemoteApiProvider

  constructor(deps: GenerationServiceDeps) {
    super()
    this.db = deps.db
    this.workQueueManager = deps.workQueueManager
    this.generationIOService = deps.generationIOService
    this.providerCatalogService = deps.providerCatalogService
    this.remoteApiProvider = deps.remoteApiProvider
  }

  async initialize(): Promise<void> {
    await this.providerCatalogService.refresh()
  }

  async submit(input: GenerationSubmitInput | GenerationParams): Promise<string> {
    const normalized = this.normalizeSubmitInput(input)

    const endpoint = await this.providerCatalogService.getEndpoint(normalized.endpointKey)
    if (!endpoint) {
      throw new Error(`Unknown endpointKey: ${normalized.endpointKey}`)
    }

    this.validateParams(normalized.params)

    const generationId = uuidv4()
    const now = new Date().toISOString()

    const { inputRecords } = await this.generationIOService.prepareInputs(
      generationId,
      normalized.params,
      now
    )

    const generationRecord: GenerationRecord = {
      id: generationId,
      number: generationRepo.getNextGenerationNumber(this.db),
      base_model_id: endpoint.canonicalModelId ?? null,
      provider: endpoint.providerId,
      model_file: endpoint.providerModelId,
      prompt: this.asString(normalized.params.prompt),
      width: this.asNumber(normalized.params.width),
      height: this.asNumber(normalized.params.height),
      seed: this.asOptionalNumber(normalized.params.seed),
      steps: this.asOptionalNumber(normalized.params.steps) ?? 4,
      guidance: this.asOptionalNumber(normalized.params.guidance) ?? 3.5,
      sampling_method:
        typeof normalized.params.sampling_method === 'string'
          ? normalized.params.sampling_method
          : 'euler',
      params_json: JSON.stringify(normalized.params),
      status: 'pending',
      error: null,
      total_time_ms: null,
      prompt_cache_hit: false,
      ref_latent_cache_hit: false,
      output_paths: null,
      created_at: now,
      started_at: null,
      completed_at: null
    }

    generationRepo.insertGeneration(this.db, generationRecord)
    this.generationIOService.insertInputRecords(inputRecords)

    if (endpoint.executionMode === 'queued-local') {
      const payload: QueuedLocalTaskPayload = {
        generationId,
        endpointKey: endpoint.endpointKey,
        params: normalized.params
      }

      await this.workQueueManager.enqueue({
        task_type: WORK_TASK_TYPES.GENERATION_LOCAL_IMAGE,
        priority: 0,
        payload_json: JSON.stringify(payload),
        correlation_id: generationId,
        owner_module: 'generation',
        max_attempts: 1
      })

      return generationId
    }

    const remoteResult = await this.remoteApiProvider.start({
      generationId,
      endpoint,
      params: normalized.params
    })

    const mediaRecords = await this.generationIOService.finalize(remoteResult)

    this.emit('result', remoteResult)
    if (mediaRecords.length > 0) {
      this.emit('libraryUpdated')
    }

    return generationId
  }

  cancel(generationId: string): void {
    const pending = this.workQueueManager.getPendingByCorrelationId(generationId)
    if (!pending) return
    this.workQueueManager.cancel(pending.id)
  }

  async listEndpoints(filter?: {
    providerId?: string
    outputType?: 'image' | 'video'
  }): Promise<CanonicalEndpointDef[]> {
    return this.providerCatalogService.listEndpoints(filter)
  }

  async getEndpointSchema(endpointKey: string): Promise<CanonicalEndpointDef | null> {
    return this.providerCatalogService.getEndpoint(endpointKey)
  }

  emitProgress(event: GenerationProgressEvent): void {
    this.emit('progress', event)
  }

  emitResult(event: {
    generationId: string
    success: boolean
    outputs?: Array<{ providerPath: string; mimeType?: string }>
    metrics?: {
      seed?: number
      totalTimeMs?: number
      promptCacheHit?: boolean
      refLatentCacheHit?: boolean
    }
    error?: string
  }): void {
    this.emit('result', event)
  }

  emitLibraryUpdated(): void {
    this.emit('libraryUpdated')
  }

  private normalizeSubmitInput(input: GenerationSubmitInput | GenerationParams): GenerationSubmitInput {
    const anyInput = input as Partial<GenerationSubmitInput>
    if (anyInput.endpointKey && anyInput.params) {
      return {
        endpointKey: anyInput.endpointKey,
        params: anyInput.params
      }
    }

    const legacy = input as GenerationParams
    return {
      endpointKey: this.providerCatalogService.getDefaultLocalEndpointKey(),
      params: {
        prompt: legacy.prompt,
        width: legacy.width,
        height: legacy.height,
        seed: legacy.seed,
        steps: legacy.steps,
        guidance: legacy.guidance,
        sampling_method: legacy.sampling_method,
        ref_image_ids: legacy.ref_image_ids,
        ref_image_paths: legacy.ref_image_paths
      }
    }
  }

  private validateParams(params: CanonicalGenerationParams): void {
    const prompt = this.asString(params.prompt).trim()
    const width = this.asNumber(params.width)
    const height = this.asNumber(params.height)

    if (!prompt) throw new Error('Prompt is required')
    if (!Number.isFinite(width) || width <= 0) throw new Error('Width must be a positive number')
    if (!Number.isFinite(height) || height <= 0) throw new Error('Height must be a positive number')
  }

  private asString(value: unknown): string {
    return typeof value === 'string' ? value : String(value ?? '')
  }

  private asNumber(value: unknown): number {
    if (typeof value === 'number') return value
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : 0
  }

  private asOptionalNumber(value: unknown): number | null {
    if (value === null || value === undefined) return null
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
}
