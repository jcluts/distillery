import { randomInt } from 'crypto'
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

interface GenerationServiceDeps {
  db: Database.Database
  workQueueManager: WorkQueueManager
  generationIOService: GenerationIOService
  providerCatalogService: ProviderCatalogService
}

interface GenerationTaskPayload {
  generationId: string
  endpointKey: string
  params: CanonicalGenerationParams
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

  async initialize(): Promise<void> {
    // Catalog builds lazily on first access — nothing to do here.
  }

  async submit(input: GenerationSubmitInput): Promise<string> {
    console.log('[GenerationService] submit:start', {
      endpointKey: input.endpointKey,
      paramKeys: Object.keys(input.params ?? {})
    })

    const endpoint = await this.providerCatalogService.getEndpoint(input.endpointKey)

    if (!endpoint) {
      console.error('[GenerationService] submit:unknown-endpoint', {
        endpointKey: input.endpointKey
      })
      throw new Error(`Unknown endpointKey: ${input.endpointKey}`)
    }

    console.log('[GenerationService] submit:endpoint-resolved', {
      endpointKey: endpoint.endpointKey,
      providerId: endpoint.providerId,
      providerModelId: endpoint.providerModelId,
      executionMode: endpoint.executionMode,
      canonicalModelId: endpoint.canonicalModelId
    })

    const params = this.withResolvedSeed(input.params)
    this.validateParams(endpoint, params)

    const generationId = uuidv4()
    const now = new Date().toISOString()
    const allSettings = settingsRepo.getAllSettings(this.db)

    const activeModelId =
      endpoint.providerId === 'local'
        ? allSettings.active_model_id
        : (endpoint.canonicalModelId ?? null)

    const activeSelections = activeModelId
      ? allSettings.model_quant_selections?.[activeModelId]
      : undefined

    const paramsWithModel = {
      ...params,
      model: {
        id: activeModelId,
        diffusionQuant: activeSelections?.diffusionQuant ?? null,
        textEncoderQuant: activeSelections?.textEncoderQuant ?? null
      }
    }

    // ref_image_ids / ref_image_paths are not stored in params_json —
    // the generation_inputs table is the authoritative source for inputs.
    // Storing them here would cause double-processing on reload.
    const paramsForStorage = { ...paramsWithModel }
    delete paramsForStorage.ref_image_ids
    delete paramsForStorage.ref_image_paths

    const { inputRecords } = await this.generationIOService.prepareInputs(
      generationId,
      params,
      now
    )

    const generationRecord: GenerationRecord = {
      id: generationId,
      number: generationRepo.getNextGenerationNumber(this.db),
      base_model_id: activeModelId,
      provider: endpoint.providerId,
      model_file: activeModelId,
      prompt: this.asString(params.prompt),
      width: this.asOptionalNumber(params.width),
      height: this.asOptionalNumber(params.height),
      seed: this.asOptionalNumber(params.seed),
      steps: this.asOptionalNumber(params.steps) ?? 4,
      guidance: this.asOptionalNumber(params.guidance) ?? 3.5,
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

    this.db.transaction(() => {
      generationRepo.insertGeneration(this.db, generationRecord)
      this.generationIOService.insertInputRecords(inputRecords)
    })()

    const payload: GenerationTaskPayload = {
      generationId,
      endpointKey: endpoint.endpointKey,
      params
    }

    const taskType =
      endpoint.executionMode === 'queued-local'
        ? WORK_TASK_TYPES.GENERATION_LOCAL_IMAGE
        : endpoint.executionMode === 'remote-async'
          ? WORK_TASK_TYPES.GENERATION_REMOTE_IMAGE
          : null

    if (!taskType) {
      console.error('[GenerationService] submit:unsupported-execution-mode', {
        endpointKey: endpoint.endpointKey,
        executionMode: endpoint.executionMode
      })
      throw new Error(
        `Execution mode "${endpoint.executionMode}" is not supported (endpoint: ${endpoint.endpointKey})`
      )
    }

    console.log('[GenerationService] submit:queue-enqueue', {
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

      console.log('[GenerationService] submit:queue-enqueued', {
        generationId,
        taskType,
        endpointKey: endpoint.endpointKey
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error('[GenerationService] submit:queue-enqueue-failed', {
        generationId,
        endpointKey: endpoint.endpointKey,
        taskType,
        error: message
      })
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

  private validateParams(endpoint: CanonicalEndpointDef, params: CanonicalGenerationParams): void {
    const prompt = this.asString(params.prompt).trim()

    if (!prompt) throw new Error('Prompt is required')

    if (endpoint.executionMode === 'queued-local') {
      const width = this.asNumber(params.width)
      const height = this.asNumber(params.height)

      if (!Number.isFinite(width) || width <= 0) {
        throw new Error('Width must be a positive number')
      }

      if (!Number.isFinite(height) || height <= 0) {
        throw new Error('Height must be a positive number')
      }
    }
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

  /**
   * If seed is null/undefined/empty, generate a random seed.
   * Uses the range 0–2^31-1 for broad engine compatibility.
   */
  private resolveOrGenerateSeed(value: unknown): number {
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
      return value
    }
    if (typeof value === 'string' && value.trim() !== '') {
      const parsed = Number(value)
      if (Number.isFinite(parsed) && parsed >= 0) return parsed
    }
    return randomInt(0, 2_147_483_647)
  }

  private withResolvedSeed(params: CanonicalGenerationParams): CanonicalGenerationParams {
    return {
      ...params,
      seed: this.resolveOrGenerateSeed(params.seed)
    }
  }
}
