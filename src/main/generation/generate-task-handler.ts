import Database from 'better-sqlite3'
import type { CanonicalGenerationParams, WorkItem, WorkTaskResult } from '../types'
import * as generationRepo from '../db/repositories/generations'
import type { WorkTaskHandler } from '../queue/work-handler-registry'
import { EndpointCatalog } from './catalog/endpoint-catalog'
import { GenerationService } from './generation-service'
import { MediaIngestionService } from './media-ingestion-service'
import { ProviderRegistry } from './providers/provider-registry'

interface TaskPayload {
  generationId: string
  endpointKey: string
  params: CanonicalGenerationParams
}

function parseTaskPayload(item: WorkItem): TaskPayload {
  let raw: unknown
  try {
    raw = JSON.parse(item.payload_json)
  } catch {
    throw new Error('Invalid payload_json for generation task')
  }

  const payload = raw as Partial<TaskPayload>
  if (
    !payload.generationId ||
    !payload.endpointKey ||
    !payload.params ||
    typeof payload.params !== 'object'
  ) {
    throw new Error('Malformed payload: requires generationId, endpointKey, and params')
  }

  return payload as TaskPayload
}

export class GenerateTaskHandler implements WorkTaskHandler {
  private db: Database.Database
  private generationService: GenerationService
  private mediaIngestionService: MediaIngestionService
  private endpointCatalog: EndpointCatalog
  private providerRegistry: ProviderRegistry

  constructor(args: {
    db: Database.Database
    generationService: GenerationService
    mediaIngestionService: MediaIngestionService
    endpointCatalog: EndpointCatalog
    providerRegistry: ProviderRegistry
  }) {
    this.db = args.db
    this.generationService = args.generationService
    this.mediaIngestionService = args.mediaIngestionService
    this.endpointCatalog = args.endpointCatalog
    this.providerRegistry = args.providerRegistry
  }

  async execute(item: WorkItem): Promise<WorkTaskResult> {
    let payload: TaskPayload
    try {
      payload = parseTaskPayload(item)
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) }
    }

    const { generationId, endpointKey, params } = payload

    try {
      const endpoint = await this.endpointCatalog.getEndpoint(endpointKey)
      if (!endpoint) {
        throw new Error(`Unknown endpointKey: ${endpointKey}`)
      }

      const provider = this.providerRegistry.get(endpoint.providerId)
      if (!provider) {
        throw new Error(`No provider registered for providerId: ${endpoint.providerId}`)
      }

      generationRepo.markGenerationStarted(this.db, generationId)

      const refImagePaths = await this.mediaIngestionService.getRefImagesForProvider(generationId)
      const outputDir = await this.mediaIngestionService.getOutputDir(generationId)

      if (provider.prepare) {
        await provider.prepare()
      }

      const result = await provider.execute({
        generationId,
        endpoint,
        params,
        refImagePaths,
        outputDir
      })

      const mediaRecords = await this.mediaIngestionService.finalize(
        generationId,
        result,
        endpoint.outputType
      )

      this.generationService.emitResult({
        generationId,
        success: result.success,
        outputs: (result.outputs ?? []).map((output) => ({
          providerPath: output.localPath,
          mimeType: output.mimeType
        })),
        metrics: result.metrics,
        error: result.error
      })

      if (mediaRecords.length > 0) {
        this.generationService.emitLibraryUpdated()
      }

      return { success: result.success, error: result.error }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      generationRepo.updateGenerationComplete(this.db, generationId, {
        status: 'failed',
        error: message
      })
      this.generationService.emitResult({ generationId, success: false, error: message })
      return { success: false, error: message }
    }
  }
}
