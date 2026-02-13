import Database from 'better-sqlite3'
import type { WorkItem, WorkTaskResult, CanonicalGenerationParams } from '../../types'
import type { WorkTaskHandler } from '../../queue/work-handler-registry'
import * as generationRepo from '../../db/repositories/generations'
import { GenerationIOService } from '../generation-io-service'
import { LocalCnEngineProvider } from '../providers/local-cn-provider'
import { ProviderCatalogService } from '../catalog/provider-catalog-service'
import { GenerationService } from '../generation-service'

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
