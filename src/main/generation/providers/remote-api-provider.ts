import * as fs from 'fs'
import type { GenerationProvider, GenerationRequest, GenerationResult } from './types'
import type { ProviderConfig } from '../catalog/provider-config'
import type { ProviderModel } from '../management/types'
import { ApiClient } from '../remote/api-client'
import { downloadRemoteOutput } from '../remote/output-downloader'

export class RemoteApiProvider implements GenerationProvider {
  readonly providerId: string
  readonly executionMode = 'remote-async' as const

  private config: ProviderConfig
  private resolveApiKey: () => string

  constructor(config: ProviderConfig, resolveApiKey: () => string) {
    this.providerId = config.providerId
    this.config = config
    this.resolveApiKey = resolveApiKey
  }

  async execute(request: GenerationRequest): Promise<GenerationResult> {
    const apiKey = this.resolveApiKey().trim()
    if (this.config.auth && !apiKey) {
      throw new Error(
        `Missing API key for provider: ${this.config.displayName ?? this.config.providerId}`
      )
    }

    await fs.promises.mkdir(request.outputDir, { recursive: true })

    const apiClient = new ApiClient(this.config, apiKey)
    const model: ProviderModel = {
      modelId: request.endpoint.providerModelId,
      name: request.endpoint.displayName,
      providerId: request.endpoint.providerId,
      requestSchema: request.endpoint.requestSchema,
      modelIdentityId: request.endpoint.canonicalModelId
    }

    const generationResult = await apiClient.generate(
      model,
      request.params as Record<string, unknown>,
      request.refImagePaths
    )

    if (!generationResult.success) {
      return {
        success: false,
        outputs: [],
        error: generationResult.error,
        metrics: generationResult.metrics
      }
    }

    const outputs = await Promise.all(
      (generationResult.outputs ?? []).map(async (output) => ({
        localPath: await this.ensureLocalOutput(output.providerPath, request.outputDir),
        mimeType: output.mimeType
      }))
    )

    return {
      success: true,
      outputs,
      metrics: generationResult.metrics
    }
  }

  private async ensureLocalOutput(providerPath: string, outputDir: string): Promise<string> {
    if (/^https?:\/\//i.test(providerPath)) {
      return await downloadRemoteOutput(providerPath, outputDir)
    }

    return providerPath
  }
}
