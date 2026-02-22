import * as fs from 'fs'
import * as path from 'path'
import type Database from 'better-sqlite3'
import { EngineManager } from '../../engine/engine-manager'
import * as settingsRepo from '../../db/repositories/settings'
import type { ModelCatalogService } from '../../models/model-catalog-service'
import { ModelResolver } from '../../models/model-resolver'
import type { GenerationProgressEvent } from '../../types'
import { asNumber, asOptionalNumber, asString, extractDimensions } from '../param-utils'
import type { GenerationProvider, GenerationRequest, GenerationResult } from './types'

export class LocalCnProvider implements GenerationProvider {
  readonly providerId = 'local'
  readonly executionMode = 'queued-local' as const

  private engineManager: EngineManager
  private db: Database.Database
  private modelCatalogService: ModelCatalogService
  private progressListeners = new Set<(event: GenerationProgressEvent) => void>()
  private executionLock: Promise<void> = Promise.resolve()

  constructor(args: {
    engineManager: EngineManager
    db: Database.Database
    modelCatalogService: ModelCatalogService
  }) {
    this.engineManager = args.engineManager
    this.db = args.db
    this.modelCatalogService = args.modelCatalogService

    this.engineManager.on('progress', (event) => {
      const progress: GenerationProgressEvent = {
        generationId: event.jobId,
        providerId: this.providerId,
        phase: event.phase,
        step: event.step,
        totalSteps: event.totalSteps,
        message: event.message
      }
      for (const listener of this.progressListeners) {
        listener(progress)
      }
    })
  }

  on(event: 'progress', listener: (event: GenerationProgressEvent) => void): void {
    if (event === 'progress') {
      this.progressListeners.add(listener)
    }
  }

  async prepare(): Promise<void> {
    const status = this.engineManager.getStatus()
    if (status.state === 'ready') return
    if (status.state !== 'idle') {
      throw new Error(`Engine is in '${status.state}' state; cannot load model`)
    }

    const settings = settingsRepo.getAllSettings(this.db)
    const catalog = this.modelCatalogService.loadCatalog()
    const resolver = new ModelResolver(catalog, settings)

    if (!resolver.isModelReady(settings.active_model_id)) {
      throw new Error(
        'Required model files are not downloaded. Open the Model Manager to set up the model.'
      )
    }

    const paths = resolver.getActiveModelPaths()
    await this.engineManager.loadModel({
      ...paths,
      offload_to_cpu: settings.offload_to_cpu,
      flash_attn: settings.flash_attn,
      vae_on_cpu: settings.vae_on_cpu,
      llm_on_cpu: settings.llm_on_cpu
    })
  }

  async execute(request: GenerationRequest): Promise<GenerationResult> {
    return await this.withExecutionLock(async () => {
      const { width, height } = extractDimensions(request.params)
      if (!width || width <= 0) {
        throw new Error('Width must be a positive number')
      }
      if (!height || height <= 0) {
        throw new Error('Height must be a positive number')
      }

      await fs.promises.mkdir(request.outputDir, { recursive: true })
      const outputPath = path.join(request.outputDir, `gen-${request.generationId}.png`)

      const params = request.params
      const result = await this.engineManager.generate({
        id: request.generationId,
        prompt: asString(params.prompt),
        width: asNumber(width),
        height: asNumber(height),
        seed: asOptionalNumber(params.seed) ?? -1,
        steps: asOptionalNumber(params.steps) ?? 4,
        guidance: asOptionalNumber(params.guidance) ?? 3.5,
        sampling_method:
          typeof params.sampling_method === 'string' ? params.sampling_method : 'euler',
        ref_images: request.refImagePaths,
        output: outputPath,
        use_prompt_cache: true,
        use_ref_latent_cache: true
      })

      if (!result.success) {
        return {
          success: false,
          outputs: [],
          error: result.error
        }
      }

      const localPath = result.outputPath || outputPath

      return {
        success: true,
        outputs: [{ localPath, mimeType: 'image/png' }],
        metrics: {
          seed: result.seed,
          totalTimeMs: result.totalTimeMs,
          promptCacheHit: result.promptCacheHit,
          refLatentCacheHit: result.refLatentCacheHit
        }
      }
    })
  }

  private async withExecutionLock<T>(action: () => Promise<T>): Promise<T> {
    const previous = this.executionLock
    let release!: () => void

    this.executionLock = new Promise<void>((resolve) => {
      release = resolve
    })

    await previous
    try {
      return await action()
    } finally {
      release()
    }
  }
}
