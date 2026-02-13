import Database from 'better-sqlite3'
import type { WorkItem, WorkTaskResult, CanonicalGenerationParams } from '../../types'
import type { WorkTaskHandler } from '../../queue/work-handler-registry'
import * as generationRepo from '../../db/repositories/generations'
import * as settingsRepo from '../../db/repositories/settings'
import { GenerationIOService } from '../generation-io-service'
import { LocalCnEngineProvider } from '../providers/local-cn-provider'
import { ProviderCatalogService } from '../catalog/provider-catalog-service'
import { GenerationService } from '../generation-service'
import type { EngineManager } from '../../engine/engine-manager'
import type { ModelCatalogService } from '../../models/model-catalog-service'
import { ModelResolver } from '../../models/model-resolver'

interface QueuedLocalTaskPayload {
  generationId: string
  endpointKey: string
  params: CanonicalGenerationParams
}

export class LocalGenerateTaskHandler implements WorkTaskHandler {
  private db: Database.Database
  private generationIOService: GenerationIOService
  private localProvider: LocalCnEngineProvider
  private providerCatalogService: ProviderCatalogService
  private generationService: GenerationService
  private engineManager: EngineManager
  private modelCatalogService: ModelCatalogService

  constructor(args: {
    db: Database.Database
    generationIOService: GenerationIOService
    localProvider: LocalCnEngineProvider
    providerCatalogService: ProviderCatalogService
    generationService: GenerationService
    engineManager: EngineManager
    modelCatalogService: ModelCatalogService
  }) {
    this.db = args.db
    this.generationIOService = args.generationIOService
    this.localProvider = args.localProvider
    this.providerCatalogService = args.providerCatalogService
    this.generationService = args.generationService
    this.engineManager = args.engineManager
    this.modelCatalogService = args.modelCatalogService
  }

  /**
   * Ensure the engine has a model loaded before generation.
   * If the engine is idle (no model), resolve the correct model from settings
   * and load it. If already 'ready', this is a no-op.
   */
  private async ensureModelLoaded(): Promise<void> {
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

  async execute(item: WorkItem): Promise<WorkTaskResult> {
    let payload: QueuedLocalTaskPayload
    try {
      payload = JSON.parse(item.payload_json) as QueuedLocalTaskPayload
    } catch {
      return {
        success: false,
        error: 'Invalid payload_json for local generation task'
      }
    }

    const generationId = payload.generationId
    if (!generationId || !payload.endpointKey || !payload.params) {
      return {
        success: false,
        error: 'Malformed payload: requires generationId, endpointKey, and params'
      }
    }

    try {
      // Lazy-load model if not already in memory
      await this.ensureModelLoaded()

      generationRepo.markGenerationStarted(this.db, generationId)

      const endpoint = await this.providerCatalogService.getEndpoint(payload.endpointKey)
      if (!endpoint) {
        throw new Error(`Unknown endpointKey: ${payload.endpointKey}`)
      }

      const refImages = await this.generationIOService.getRefImagesForProvider(generationId)
      const outputPath = await this.generationIOService.getTempOutputPath(generationId)

      const result = await this.localProvider.start({
        generationId,
        endpoint,
        params: payload.params,
        outputPath,
        preparedInputs: { refImages }
      })

      const mediaRecords = await this.generationIOService.finalize(result)

      this.generationService.emitResult(result)
      if (mediaRecords.length > 0) {
        this.generationService.emitLibraryUpdated()
      }

      return {
        success: result.success,
        error: result.error
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)

      generationRepo.updateGenerationComplete(this.db, generationId, {
        status: 'failed',
        error: message
      })

      this.generationService.emitResult({
        generationId,
        success: false,
        error: message
      })

      return {
        success: false,
        error: message
      }
    }
  }
}
