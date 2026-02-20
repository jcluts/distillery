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

    console.log('[RemoteGenerateTaskHandler] execute:start', {
      workItemId: item.id,
      correlationId: item.correlation_id,
      taskType: item.task_type,
      payloadLength: item.payload_json?.length ?? 0
    })

    try {
      payload = JSON.parse(item.payload_json) as RemoteTaskPayload
    } catch {
      console.error('[RemoteGenerateTaskHandler] execute:invalid-payload-json', {
        workItemId: item.id,
        correlationId: item.correlation_id,
        payloadPreview:
          typeof item.payload_json === 'string'
            ? item.payload_json.slice(0, 200)
            : String(item.payload_json)
      })
      return {
        success: false,
        error: 'Invalid payload_json for remote generation task'
      }
    }

    const generationId = payload.generationId
    if (!generationId || !payload.endpointKey || !payload.params || typeof payload.params !== 'object') {
      console.error('[RemoteGenerateTaskHandler] execute:malformed-payload', {
        workItemId: item.id,
        generationId,
        endpointKey: payload.endpointKey,
        hasParams: !!payload.params
      })
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

      console.log('[RemoteGenerateTaskHandler] execute:endpoint-resolved', {
        generationId,
        endpointKey: payload.endpointKey,
        providerId: endpoint.providerId,
        providerModelId: endpoint.providerModelId,
        executionMode: endpoint.executionMode
      })

      if (endpoint.executionMode !== 'remote-async') {
        throw new Error(`Endpoint is not remote-async: ${payload.endpointKey}`)
      }

      const providerConfig = this.providerManagerService.getProviderConfig(endpoint.providerId)
      if (!providerConfig) {
        throw new Error(`Unknown provider: ${endpoint.providerId}`)
      }

      console.log('[RemoteGenerateTaskHandler] execute:provider-config', {
        generationId,
        providerId: providerConfig.providerId,
        hasAuth: !!providerConfig.auth,
        endpointTemplate: providerConfig.request?.endpointTemplate,
        asyncEnabled: !!providerConfig.async?.enabled,
        pollEndpoint: providerConfig.async?.pollEndpoint
      })

      const apiKey = this.providerManagerService.getApiKey(endpoint.providerId)
      if (providerConfig.auth && !apiKey.trim()) {
        throw new Error(`Missing API key for provider: ${providerConfig.displayName ?? providerConfig.providerId}`)
      }

      console.log('[RemoteGenerateTaskHandler] execute:auth-state', {
        generationId,
        providerId: endpoint.providerId,
        hasApiKey: apiKey.trim().length > 0
      })

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
      console.log('[RemoteGenerateTaskHandler] execute:request-ready', {
        generationId,
        endpointKey: endpoint.endpointKey,
        providerId: endpoint.providerId,
        providerModelId: endpoint.providerModelId,
        paramsSummary: this.summarizeParams(payload.params),
        refImageCount: refImages.length
      })

      const generationResult = await apiClient.generate(
        model,
        payload.params as Record<string, unknown>,
        refImages
      )

      console.log('[RemoteGenerateTaskHandler] execute:provider-result', {
        generationId,
        success: generationResult.success,
        outputCount: generationResult.outputs?.length ?? 0,
        hasMetrics: !!generationResult.metrics,
        error: generationResult.error ?? null
      })

      const localOutputs = await Promise.all(
        (generationResult.outputs ?? []).map(async (output) => ({
          ...output,
          providerPath: await this.ensureLocalOutput(output.providerPath)
        }))
      )

      console.log('[RemoteGenerateTaskHandler] execute:local-outputs-ready', {
        generationId,
        localOutputCount: localOutputs.length,
        localOutputPreview: localOutputs.slice(0, 3).map((output) => ({
          providerPath: output.providerPath,
          mimeType: output.mimeType
        }))
      })

      const finalized = await this.generationIOService.finalize({
        generationId,
        success: generationResult.success,
        outputs: localOutputs,
        metrics: generationResult.metrics,
        error: generationResult.error
      })

      console.log('[RemoteGenerateTaskHandler] execute:finalized', {
        generationId,
        finalizedCount: finalized.length,
        success: generationResult.success
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
      console.error('[RemoteGenerateTaskHandler] execute:failed', {
        workItemId: item.id,
        correlationId: item.correlation_id,
        generationId,
        endpointKey: payload.endpointKey,
        error: message,
        stack: error instanceof Error ? error.stack : undefined
      })

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

  private summarizeParams(params: CanonicalGenerationParams): Record<string, unknown> {
    const summary: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(params)) {
      if (typeof value === 'string') {
        summary[key] = `${value.slice(0, 80)} (len=${value.length})`
        continue
      }

      if (Array.isArray(value)) {
        summary[key] = `array(len=${value.length})`
        continue
      }

      if (value && typeof value === 'object') {
        summary[key] = `object(keys=${Object.keys(value as Record<string, unknown>).join(',')})`
        continue
      }

      summary[key] = value
    }
    return summary
  }

  private async ensureLocalOutput(providerPath: string): Promise<string> {
    if (/^https?:\/\//i.test(providerPath)) {
      console.log('[RemoteGenerateTaskHandler] ensureLocalOutput:downloading', {
        providerPath
      })
      return await downloadRemoteOutput(providerPath)
    }

    return providerPath
  }
}
