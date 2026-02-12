import Database from 'better-sqlite3'
import type { WorkItem, WorkTaskResult } from '../../types'
import type { WorkTaskHandler } from '../../queue/work-handler-registry'
import * as generationRepo from '../../db/repositories/generations'
import { GenerationIOService } from '../generation-io-service'
import { LocalCnEngineProvider } from '../providers/local-cn-provider'
import { ProviderCatalogService } from '../catalog/provider-catalog-service'
import { GenerationService } from '../generation-service'

interface QueuedLocalTaskPayload {
  generationId: string
  endpointKey?: string
  params: {
    prompt: string
    width: number
    height: number
    seed?: number
    steps?: number
    guidance?: number
    sampling_method?: string
    ref_image_ids?: string[]
    ref_image_paths?: string[]
    [key: string]: unknown
  }
}

export class LocalGenerateTaskHandler implements WorkTaskHandler {
  private db: Database.Database
  private generationIOService: GenerationIOService
  private localProvider: LocalCnEngineProvider
  private providerCatalogService: ProviderCatalogService
  private generationService: GenerationService

  constructor(args: {
    db: Database.Database
    generationIOService: GenerationIOService
    localProvider: LocalCnEngineProvider
    providerCatalogService: ProviderCatalogService
    generationService: GenerationService
  }) {
    this.db = args.db
    this.generationIOService = args.generationIOService
    this.localProvider = args.localProvider
    this.providerCatalogService = args.providerCatalogService
    this.generationService = args.generationService
  }

  async execute(item: WorkItem): Promise<WorkTaskResult> {
    let payload: Partial<QueuedLocalTaskPayload>
    try {
      payload = JSON.parse(item.payload_json) as Partial<QueuedLocalTaskPayload>
    } catch {
      return {
        success: false,
        error: 'Invalid payload_json for local generation task'
      }
    }

    const generationId = payload.generationId ?? item.correlation_id ?? ''
    if (!generationId) {
      return {
        success: false,
        error: 'Missing generationId for local generation task'
      }
    }

    try {
      generationRepo.markGenerationStarted(this.db, generationId)

      const generation = generationRepo.getGenerationById(this.db, generationId)
      if (!generation) {
        throw new Error(`Generation record not found: ${generationId}`)
      }

      const endpointKey =
        payload.endpointKey ??
        (generation.provider === 'local'
          ? 'local.flux2-klein.image'
          : `${generation.provider}.${generation.model_file ?? 'unknown'}.image`)

      const payloadParams = payload.params ??
        (generation.params_json ? (JSON.parse(generation.params_json) as QueuedLocalTaskPayload['params']) : null)

      const params: QueuedLocalTaskPayload['params'] = {
        prompt: generation.prompt ?? '',
        width: generation.width ?? 1024,
        height: generation.height ?? 1024,
        seed: generation.seed ?? undefined,
        steps: generation.steps ?? undefined,
        guidance: generation.guidance ?? undefined,
        sampling_method: generation.sampling_method ?? undefined,
        ...(payloadParams ?? {})
      }

      const endpoint = await this.providerCatalogService.getEndpoint(endpointKey)
      if (!endpoint) {
        throw new Error(`Unknown endpointKey in queued payload: ${endpointKey}`)
      }

      const refImages = await this.generationIOService.getRefImagesForProvider(generationId)
      const outputPath = await this.generationIOService.getTempOutputPath(generationId)

      const result = await this.localProvider.start({
        generationId,
        endpoint,
        params,
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
