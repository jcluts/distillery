import { EventEmitter } from 'events'
import { v4 as uuidv4 } from 'uuid'
import Database from 'better-sqlite3'
import * as generationRepo from '../db/repositories/generations'
import * as settingsRepo from '../db/repositories/settings'
import type {
  CanonicalGenerationParams,
  CanonicalEndpointDef,
  GenerationProgressEvent,
  GenerationRecord,
  GenerationSubmitInput
} from '../types'
import { WorkQueueManager } from '../queue/work-queue-manager'
import { WORK_TASK_TYPES } from '../queue/work-task-types'
import { GenerationIOService } from './generation-io-service'
import { ProviderCatalogService } from './catalog/provider-catalog-service'
import {
  asString,
  asNumber,
  asOptionalNumber,
  extractDimensions,
  withResolvedSeed
} from './param-utils'

interface GenerationServiceDeps {
  db: Database.Database
  workQueueManager: WorkQueueManager
  generationIOService: GenerationIOService
  providerCatalogService: ProviderCatalogService
}

export class GenerationService extends EventEmitter {
  private db: Database.Database
  private workQueueManager: WorkQueueManager
  private generationIOService: GenerationIOService
  private providerCatalogService: ProviderCatalogService

  constructor(deps: GenerationServiceDeps) {
    super()
    this.db = deps.db
    this.workQueueManager = deps.workQueueManager
    this.generationIOService = deps.generationIOService
    this.providerCatalogService = deps.providerCatalogService
  }

  async submit(input: GenerationSubmitInput): Promise<string> {
    const endpoint = await this.providerCatalogService.getEndpoint(input.endpointKey)
    if (!endpoint) {
      throw new Error(`Unknown endpointKey: ${input.endpointKey}`)
    }

    const params = withResolvedSeed(input.params)
    this.validateParams(endpoint, params)

    const generationId = uuidv4()
    const now = new Date().toISOString()

    const paramsForStorage = this.buildStorageParams(endpoint, params)
    const { inputRecords } = await this.generationIOService.prepareInputs(
      generationId,
      params,
      now
    )

    const generationRecord = this.buildGenerationRecord(
      generationId,
      endpoint,
      params,
      paramsForStorage,
      now
    )

    this.db.transaction(() => {
      generationRepo.insertGeneration(this.db, generationRecord)
      this.generationIOService.insertInputRecords(inputRecords)
    })()

    const taskType = this.resolveTaskType(endpoint)
    const payload = { generationId, endpointKey: endpoint.endpointKey, params }

    console.log('[GenerationService] submit', {
      generationId,
      endpointKey: endpoint.endpointKey,
      providerId: endpoint.providerId,
      taskType
    })

    try {
      await this.workQueueManager.enqueue({
        task_type: taskType,
        priority: 0,
        payload_json: JSON.stringify(payload),
        correlation_id: generationId,
        owner_module: 'generation',
        max_attempts: 1
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error('[GenerationService] enqueue failed', { generationId, error: message })
      generationRepo.updateGenerationComplete(this.db, generationId, {
        status: 'failed',
        error: `Failed to enqueue generation task: ${message}`
      })
      throw error
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

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private validateParams(
    endpoint: CanonicalEndpointDef,
    params: CanonicalGenerationParams
  ): void {
    if (!asString(params.prompt).trim()) {
      throw new Error('Prompt is required')
    }

    if (endpoint.executionMode === 'queued-local') {
      const width = asNumber(params.width)
      const height = asNumber(params.height)
      if (!Number.isFinite(width) || width <= 0) {
        throw new Error('Width must be a positive number')
      }
      if (!Number.isFinite(height) || height <= 0) {
        throw new Error('Height must be a positive number')
      }
    }
  }

  /**
   * Build the params object stored in params_json. Attaches model metadata
   * and strips ref image fields (those live in the generation_inputs table).
   */
  private buildStorageParams(
    endpoint: CanonicalEndpointDef,
    params: CanonicalGenerationParams
  ): Record<string, unknown> {
    const allSettings = settingsRepo.getAllSettings(this.db)

    const activeModelId =
      endpoint.providerId === 'local'
        ? allSettings.active_model_id
        : (endpoint.canonicalModelId ?? null)

    const activeSelections = activeModelId
      ? allSettings.model_quant_selections?.[activeModelId]
      : undefined

    const storage: Record<string, unknown> = {
      ...params,
      model: {
        id: activeModelId,
        diffusionQuant: activeSelections?.diffusionQuant ?? null,
        textEncoderQuant: activeSelections?.textEncoderQuant ?? null
      }
    }

    // Ref image fields live in generation_inputs — don't duplicate them here.
    delete storage.ref_image_ids
    delete storage.ref_image_paths

    return storage
  }

  private buildGenerationRecord(
    generationId: string,
    endpoint: CanonicalEndpointDef,
    params: CanonicalGenerationParams,
    paramsForStorage: Record<string, unknown>,
    now: string
  ): GenerationRecord {
    const allSettings = settingsRepo.getAllSettings(this.db)

    const activeModelId =
      endpoint.providerId === 'local'
        ? allSettings.active_model_id
        : (endpoint.canonicalModelId ?? null)

    const { width, height } = extractDimensions(params)

    return {
      id: generationId,
      number: generationRepo.getNextGenerationNumber(this.db),
      // base_model_id is a FK to the local base_models table — only valid
      // for the local provider; remote endpoints store null.
      base_model_id: endpoint.providerId === 'local' ? activeModelId : null,
      provider: endpoint.providerId,
      model_file:
        endpoint.providerId === 'local' ? activeModelId : endpoint.providerModelId,
      prompt: asString(params.prompt),
      width,
      height,
      seed: asOptionalNumber(params.seed),
      steps: asOptionalNumber(params.steps) ?? 4,
      guidance: asOptionalNumber(params.guidance) ?? 3.5,
      sampling_method:
        typeof params.sampling_method === 'string' ? params.sampling_method : 'euler',
      params_json: JSON.stringify(paramsForStorage),
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
  }

  private resolveTaskType(endpoint: CanonicalEndpointDef): string {
    if (endpoint.executionMode === 'queued-local') {
      return WORK_TASK_TYPES.GENERATION_LOCAL_IMAGE
    }
    if (endpoint.executionMode === 'remote-async') {
      return WORK_TASK_TYPES.GENERATION_REMOTE_IMAGE
    }
    throw new Error(
      `Execution mode "${endpoint.executionMode}" is not supported (endpoint: ${endpoint.endpointKey})`
    )
  }
}
