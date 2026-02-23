import type { CanonicalEndpointDef } from '../../types'
import { inferModeInfo } from '../param-utils'
import type { ProviderModel } from '../management/types'
import type { ProviderConfig, ProviderEndpointConfig } from './provider-config'
import { ProviderConfigService } from './provider-config'
import { normalizeRequestSchema, normalizeUiSchema } from './schema-normalizer'

type UserModelProviderEntries = Array<{ providerId: string; models: ProviderModel[] }>

export class EndpointCatalog {
  private configService: ProviderConfigService
  private getUserModels: () => UserModelProviderEntries
  private resolveIdentityId?: (providerId: string, providerModelId: string) => string | null
  private endpointsByKey = new Map<string, CanonicalEndpointDef>()
  private dirty = true

  constructor(
    configService: ProviderConfigService,
    getUserModels: () => UserModelProviderEntries,
    resolveIdentityId?: (providerId: string, providerModelId: string) => string | null
  ) {
    this.configService = configService
    this.getUserModels = getUserModels
    this.resolveIdentityId = resolveIdentityId
  }

  invalidate(): void {
    this.dirty = true
  }

  private ensureFresh(): void {
    if (!this.dirty) return

    const providerConfigs = this.configService.loadMergedProviderConfigs()
    const endpoints: CanonicalEndpointDef[] = []

    for (const provider of providerConfigs) {
      try {
        const fromConfig = this.fromProviderConfigEndpoints(provider)
        endpoints.push(...fromConfig)
      } catch (error) {
        console.warn(
          `[EndpointCatalog] Failed to process provider "${provider.providerId}":`,
          error instanceof Error ? error.message : error
        )
      }
    }

    for (const { providerId, models } of this.getUserModels()) {
      const provider = providerConfigs.find((p) => p.providerId === providerId)
      if (!provider) continue

      for (const model of models) {
        const endpoint = this.mapUserModel(provider, model)
        if (endpoint) endpoints.push(endpoint)
      }
    }

    this.endpointsByKey = new Map(endpoints.map((endpoint) => [endpoint.endpointKey, endpoint]))
    this.dirty = false
  }

  async listEndpoints(filter?: {
    providerId?: string
    outputType?: 'image' | 'video'
  }): Promise<CanonicalEndpointDef[]> {
    this.ensureFresh()
    let endpoints = Array.from(this.endpointsByKey.values())

    if (filter?.providerId) {
      endpoints = endpoints.filter((endpoint) => endpoint.providerId === filter.providerId)
    }

    if (filter?.outputType) {
      endpoints = endpoints.filter((endpoint) => endpoint.outputType === filter.outputType)
    }

    return endpoints
  }

  async getEndpoint(endpointKey: string): Promise<CanonicalEndpointDef | null> {
    this.ensureFresh()
    return this.endpointsByKey.get(endpointKey) ?? null
  }

  private fromProviderConfigEndpoints(provider: ProviderConfig): CanonicalEndpointDef[] {
    return (provider.endpoints ?? []).map((endpoint) => this.mapStaticEndpoint(provider, endpoint))
  }

  private mapStaticEndpoint(
    provider: ProviderConfig,
    endpoint: ProviderEndpointConfig
  ): CanonicalEndpointDef {
    const modelIdentityId =
      endpoint.canonicalModelId ??
      endpoint.modelIdentityId ??
      this.resolveIdentityId?.(provider.providerId, endpoint.providerModelId) ??
      undefined

    return {
      endpointKey: endpoint.endpointKey,
      providerId: provider.providerId,
      providerModelId: endpoint.providerModelId,
      modelIdentityId,
      displayName: endpoint.displayName,
      modes: endpoint.modes,
      outputType: endpoint.outputType,
      executionMode: endpoint.executionMode,
      requestSchema: normalizeRequestSchema(endpoint.requestSchema),
      uiSchema: normalizeUiSchema(endpoint.uiSchema)
    }
  }

  private mapUserModel(provider: ProviderConfig, model: ProviderModel): CanonicalEndpointDef | null {
    if (!model.modelId?.trim()) return null

    const modeInfo = inferModeInfo(model.type, model.modelId)
    const modelIdentityId =
      model.modelIdentityId ??
      this.resolveIdentityId?.(provider.providerId, model.modelId) ??
      undefined

    return {
      endpointKey: `${provider.providerId}.${model.modelId}.${modeInfo.outputType}`,
      providerId: provider.providerId,
      providerModelId: model.modelId,
      modelIdentityId,
      displayName: model.name?.trim() || model.modelId,
      modes: modeInfo.modes,
      outputType: modeInfo.outputType,
      executionMode: provider.executionMode ?? 'remote-async',
      requestSchema: normalizeRequestSchema(model.requestSchema)
    }
  }
}
