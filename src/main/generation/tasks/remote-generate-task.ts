import Database from 'better-sqlite3'
import type { CanonicalGenerationParams, WorkItem, WorkTaskResult } from '../../types'
import * as generationRepo from '../../db/repositories/generations'
import type { WorkTaskHandler } from '../../queue/work-handler-registry'
import { GenerationIOService } from '../generation-io-service'
import { GenerationService } from '../generation-service'
import { ProviderManagerService } from '../api/provider-manager-service'
import { ApiClient, downloadRemoteOutput } from '../api/api-client'
import type { ProviderModel } from '../api/types'

interface RemoteTaskPayload {
  generationId: string
  endpointKey: string
  params: CanonicalGenerationParams
}

export class RemoteGenerateTaskHandler implements WorkTaskHandler {
  private db: Database.Database
  private generationService: GenerationService
  private generationIOService: GenerationIOService
  private providerManagerService: ProviderManagerService

  constructor(
    db: Database.Database,
    generationService: GenerationService,
    generationIOService: GenerationIOService,
    providerManagerService: ProviderManagerService
  ) {
    this.db = db
    this.generationService = generationService
    this.generationIOService = generationIOService
    this.providerManagerService = providerManagerService
  }

  async execute(item: WorkItem): Promise<WorkTaskResult> {
    let payload: RemoteTaskPayload

    try {
      payload = JSON.parse(item.payload_json) as RemoteTaskPayload
    } catch {
      return {
        success: false,
        error: 'Invalid payload_json for remote generation task'
      }
    }

    const generationId = payload.generationId
    if (!generationId || !payload.endpointKey || !payload.params || typeof payload.params !== 'object') {
      return {
        success: false,
        error: 'Malformed payload: requires generationId, endpointKey, and params'
      }
    }

    try {
      const endpoint = await this.generationService.getEndpointSchema(payload.endpointKey)
      if (!endpoint) {
        throw new Error(`Unknown endpointKey: ${payload.endpointKey}`)
      }

      if (endpoint.executionMode !== 'remote-async') {
        throw new Error(`Endpoint is not remote-async: ${payload.endpointKey}`)
      }

      const providerConfig = this.providerManagerService.getProviderConfig(endpoint.providerId)
      if (!providerConfig) {
        throw new Error(`Unknown provider: ${endpoint.providerId}`)
      }

      const apiKey = this.providerManagerService.getApiKey(endpoint.providerId)
      if (providerConfig.auth && !apiKey.trim()) {
        throw new Error(`Missing API key for provider: ${providerConfig.displayName ?? providerConfig.providerId}`)
      }

      generationRepo.markGenerationStarted(this.db, generationId)

      const apiClient = new ApiClient(providerConfig, apiKey)
      const model: ProviderModel = {
        modelId: endpoint.providerModelId,
        name: endpoint.displayName,
        providerId: endpoint.providerId,
        requestSchema: endpoint.requestSchema,
        modelIdentityId: endpoint.canonicalModelId
      }

      const refImages = await this.generationIOService.getRefImagesForProvider(generationId)
      const generationResult = await apiClient.generate(
        model,
        payload.params as Record<string, unknown>,
        refImages
      )

      const localOutputs = await Promise.all(
        (generationResult.outputs ?? []).map(async (output) => ({
          ...output,
          providerPath: await this.ensureLocalOutput(output.providerPath)
        }))
      )

      const finalized = await this.generationIOService.finalize({
        generationId,
        success: generationResult.success,
        outputs: localOutputs,
        metrics: generationResult.metrics,
        error: generationResult.error
      })

      this.generationService.emitResult({
        generationId,
        success: generationResult.success,
        outputs: localOutputs,
        metrics: generationResult.metrics,
        error: generationResult.error
      })

      if (finalized.length > 0) {
        this.generationService.emitLibraryUpdated()
      }

      return {
        success: generationResult.success,
        error: generationResult.error
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

  private async ensureLocalOutput(providerPath: string): Promise<string> {
    if (/^https?:\/\//i.test(providerPath)) {
      return await downloadRemoteOutput(providerPath)
    }

    return providerPath
  }
}
