import type { CanonicalEndpointDef } from '../../types'
import type { ProviderConfig, ProviderEndpointConfig } from './provider-config-service'
import { ProviderConfigService } from './provider-config-service'
import { normalizeRequestSchema, normalizeUiSchema } from './schema-normalizer'
import { inferModeInfo } from './adapters/adapter-utils'
import type { ProviderModel } from '../api/types'

const DEFAULT_LOCAL_ENDPOINT_KEY = 'local.flux2-klein.image'

/**
 * Provides the interface for user model access — implemented by ProviderManagerService.
 * This avoids a circular dependency: catalog doesn't import the manager, the manager
 * registers itself as the user model source.
 */
export interface UserModelSource {
  getProvidersWithUserModels(): Array<{ providerId: string; models: ProviderModel[] }>
}

/**
 * In-memory endpoint catalog. Built once at startup, invalidated explicitly
 * when user models change. No disk I/O for the catalog itself.
 *
 * Sources of endpoints (in priority order, last wins on key collision):
 *   1. Static endpoints from provider config JSONs (e.g. local.json endpoints[])
 *   2. User-added models from ProviderManagerService
 */
export class ProviderCatalogService {
  private configService: ProviderConfigService
  private userModelSource: UserModelSource | null = null
  private endpointsByKey = new Map<string, CanonicalEndpointDef>()
  private dirty = true

  constructor(configService?: ProviderConfigService) {
    this.configService = configService ?? new ProviderConfigService()
  }

  /**
   * Register the source of user models. Called once during app init,
   * after ProviderManagerService is constructed.
   */
  setUserModelSource(source: UserModelSource): void {
    this.userModelSource = source
    this.invalidate()
  }

  /**
   * Mark the cache as stale. Next call to listEndpoints/getEndpoint will rebuild.
   */
  invalidate(): void {
    this.dirty = true
  }

  /**
   * Rebuild the endpoint map if stale. This is cheap: reads in-memory configs +
   * in-memory user models, normalizes schemas, deduplicates. No disk I/O.
   */
  private ensureFresh(): void {
    if (!this.dirty) return

    const providerConfigs = this.configService.loadMergedProviderConfigs()
    const endpoints: CanonicalEndpointDef[] = []

    // 1. Static endpoints from provider configs
    for (const provider of providerConfigs) {
      try {
        const fromConfig = this.fromProviderConfigEndpoints(provider)
        endpoints.push(...fromConfig)
      } catch (error) {
        console.warn(
          `[ProviderCatalogService] Failed to process provider "${provider.providerId}":`,
          error instanceof Error ? error.message : error
        )
      }
    }

    // 2. User-added models
    if (this.userModelSource) {
      for (const { providerId, models } of this.userModelSource.getProvidersWithUserModels()) {
        const provider = providerConfigs.find((p) => p.providerId === providerId)
        if (!provider) continue

        for (const model of models) {
          const ep = this.mapUserModel(provider, model)
          if (ep) endpoints.push(ep)
        }
      }
    }

    // 3. Ensure default local endpoint exists
    if (!endpoints.some((ep) => ep.endpointKey === DEFAULT_LOCAL_ENDPOINT_KEY)) {
      endpoints.push(this.createDefaultLocalEndpoint())
    }

    // 4. Deduplicate (last wins)
    this.endpointsByKey = new Map(endpoints.map((ep) => [ep.endpointKey, ep]))
    this.dirty = false
  }

  async listEndpoints(filter?: {
    providerId?: string
    outputType?: 'image' | 'video'
  }): Promise<CanonicalEndpointDef[]> {
    this.ensureFresh()
    let endpoints = Array.from(this.endpointsByKey.values())

    if (filter?.providerId) {
      endpoints = endpoints.filter((ep) => ep.providerId === filter.providerId)
    }
    if (filter?.outputType) {
      endpoints = endpoints.filter((ep) => ep.outputType === filter.outputType)
    }
    return endpoints
  }

  async getEndpoint(endpointKey: string): Promise<CanonicalEndpointDef | null> {
    this.ensureFresh()
    return this.endpointsByKey.get(endpointKey) ?? null
  }

  // ---------------------------------------------------------------------------
  // Mapping helpers
  // ---------------------------------------------------------------------------

  private fromProviderConfigEndpoints(provider: ProviderConfig): CanonicalEndpointDef[] {
    return (provider.endpoints ?? []).map((ep) => this.mapStaticEndpoint(provider, ep))
  }

  private mapStaticEndpoint(
    provider: ProviderConfig,
    endpoint: ProviderEndpointConfig
  ): CanonicalEndpointDef {
    return {
      endpointKey: endpoint.endpointKey,
      providerId: provider.providerId,
      providerModelId: endpoint.providerModelId,
      canonicalModelId: endpoint.canonicalModelId,
      displayName: endpoint.displayName,
      modes: endpoint.modes,
      outputType: endpoint.outputType,
      executionMode: endpoint.executionMode,
      requestSchema: normalizeRequestSchema(endpoint.requestSchema),
      uiSchema: normalizeUiSchema(endpoint.uiSchema)
    }
  }

  private mapUserModel(
    provider: ProviderConfig,
    model: ProviderModel
  ): CanonicalEndpointDef | null {
    if (!model.modelId?.trim()) return null

    const modeInfo = inferModeInfo(model.type, model.modelId)

    return {
      endpointKey: `${provider.providerId}.${model.modelId}.${modeInfo.outputType}`,
      providerId: provider.providerId,
      providerModelId: model.modelId,
      canonicalModelId: model.modelIdentityId,
      displayName: model.name?.trim() || model.modelId,
      modes: modeInfo.modes,
      outputType: modeInfo.outputType,
      executionMode: provider.mode ?? 'remote-async',
      requestSchema: normalizeRequestSchema(model.requestSchema)
    }
  }

  private createDefaultLocalEndpoint(): CanonicalEndpointDef {
    return {
      endpointKey: DEFAULT_LOCAL_ENDPOINT_KEY,
      providerId: 'local',
      providerModelId: 'flux2-klein',
      displayName: 'FLUX.2 Klein (Local)',
      modes: ['text-to-image', 'image-to-image'],
      outputType: 'image',
      executionMode: 'queued-local',
      requestSchema: normalizeRequestSchema({
        properties: {
          prompt: {
            type: 'string',
            title: 'Prompt',
            description: 'Describe what you want to see'
          },
          size: {
            type: 'string',
            title: 'Size',
            default: '1024*1024',
            minimum: 256,
            maximum: 2048,
            ui: { component: 'local-size', hideLabel: true }
          },
          steps: {
            type: 'integer',
            title: 'Steps',
            description: 'Number of diffusion steps',
            default: 4,
            minimum: 1,
            maximum: 10,
            ui: { hidden: true }
          },
          sampling_method: {
            type: 'string',
            title: 'Sampler',
            default: 'euler',
            ui: { hidden: true, component: 'internal' }
          },
          seed: {
            type: 'integer',
            title: 'Seed',
            description: 'Leave empty for random',
            minimum: 0,
            maximum: 2147483647,
            ui: { hidden: true }
          },
          ref_image_ids: {
            type: 'array',
            items: { type: 'string' },
            ui: { hidden: true, component: 'internal' }
          },
          ref_image_paths: {
            type: 'array',
            items: { type: 'string' },
            ui: { hidden: true, component: 'internal' }
          }
        },
        required: ['prompt'],
        order: ['prompt', 'size', 'steps', 'seed', 'sampling_method']
      })
    }
  }
}
