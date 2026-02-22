import Database from 'better-sqlite3'
import type { WorkItem, WorkTaskResult } from '../../types'
import * as generationRepo from '../../db/repositories/generations'
import type { WorkTaskHandler } from '../../queue/work-handler-registry'
import { GenerationIOService } from '../generation-io-service'
import { GenerationService } from '../generation-service'
import { ProviderManagerService } from '../api/provider-manager-service'
import { ApiClient, downloadRemoteOutput } from '../api/api-client'
import type { ProviderModel } from '../api/types'
import { parseTaskPayload, finalizeAndNotify, handleTaskFailure } from './task-utils'

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
    let payload: ReturnType<typeof parseTaskPayload>
    try {
      payload = parseTaskPayload(item)
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) }
    }

    const { generationId, endpointKey, params } = payload

    try {
      const endpoint = await this.generationService.getEndpointSchema(endpointKey)
      if (!endpoint) throw new Error(`Unknown endpointKey: ${endpointKey}`)
      if (endpoint.executionMode !== 'remote-async') {
        throw new Error(`Endpoint is not remote-async: ${endpointKey}`)
      }

      const providerConfig = this.providerManagerService.getProviderConfig(endpoint.providerId)
      if (!providerConfig) throw new Error(`Unknown provider: ${endpoint.providerId}`)

      const apiKey = this.providerManagerService.getApiKey(endpoint.providerId)
      if (providerConfig.auth && !apiKey.trim()) {
        throw new Error(
          `Missing API key for provider: ${providerConfig.displayName ?? providerConfig.providerId}`
        )
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
        params as Record<string, unknown>,
        refImages
      )

      // Download any remote URLs to local temp files
      const localOutputs = await Promise.all(
        (generationResult.outputs ?? []).map(async (output) => ({
          ...output,
          providerPath: await this.ensureLocalOutput(output.providerPath)
        }))
      )

      return finalizeAndNotify(this.generationIOService, this.generationService, {
        generationId,
        success: generationResult.success,
        outputs: localOutputs,
        metrics: generationResult.metrics,
        error: generationResult.error
      })
    } catch (error) {
      console.error('[RemoteGenerateTaskHandler] failed:', generationId, error)
      return handleTaskFailure(this.db, this.generationService, generationId, error)
    }
  }

  private async ensureLocalOutput(providerPath: string): Promise<string> {
    if (/^https?:\/\//i.test(providerPath)) {
      return await downloadRemoteOutput(providerPath)
    }
    return providerPath
  }
}
