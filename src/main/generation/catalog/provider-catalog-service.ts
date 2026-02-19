import type { CanonicalEndpointDef } from '../../types'
import { CatalogStore } from './catalog-store'
import type { ProviderConfig, ProviderEndpointConfig } from './provider-config-service'
import { ProviderConfigService } from './provider-config-service'
import { createProviderAdapter } from './adapters/adapter-factory'
import { normalizeRequestSchema, normalizeUiSchema } from './schema-normalizer'

const DEFAULT_LOCAL_ENDPOINT_KEY = 'local.flux2-klein.image'

export class ProviderCatalogService {
  private configService: ProviderConfigService
  private store: CatalogStore
  private endpointsByKey = new Map<string, CanonicalEndpointDef>()

  constructor(configService?: ProviderConfigService, store?: CatalogStore) {
    this.configService = configService ?? new ProviderConfigService()
    this.store = store ?? new CatalogStore()
  }

  async refresh(): Promise<void> {
    const providerConfigs = this.configService.loadMergedProviderConfigs()

    const endpoints: CanonicalEndpointDef[] = []

    for (const provider of providerConfigs) {
      try {
        const fromConfig = this.fromProviderConfigEndpoints(provider)
        endpoints.push(...fromConfig)

        const fromUserModels = this.fromProviderUserModels(provider)
        endpoints.push(...fromUserModels)

        const adapter = createProviderAdapter(provider.adapter)
        if (adapter) {
          const rawFeed = this.store.readRawFeed(provider.providerId)
          const defaultRequestSchema = fromConfig[0]?.requestSchema ?? this.defaultRequestSchema()
          const adaptedEndpoints = adapter.transform({
            providerConfig: provider,
            rawFeed,
            defaultRequestSchema
          })
          endpoints.push(...adaptedEndpoints)
        }
      } catch (error) {
        console.warn(
          `[ProviderCatalogService] Failed to process provider "${provider.providerId}", skipping:`,
          error instanceof Error ? error.message : error
        )
      }
    }

    if (!endpoints.some((endpoint) => endpoint.endpointKey === DEFAULT_LOCAL_ENDPOINT_KEY)) {
      endpoints.push(this.createDefaultLocalEndpoint())
    }

    const deduped = new Map<string, CanonicalEndpointDef>()
    for (const endpoint of endpoints) {
      if (deduped.has(endpoint.endpointKey)) {
        const existing = deduped.get(endpoint.endpointKey)
        console.warn(
          `[ProviderCatalogService] Duplicate endpointKey "${endpoint.endpointKey}" from provider "${endpoint.providerId}"; overriding previous provider "${existing?.providerId}".`
        )
      }
      deduped.set(endpoint.endpointKey, endpoint)
    }

    const normalizedEndpoints = Array.from(deduped.values())
    this.endpointsByKey = new Map(
      normalizedEndpoints.map((endpoint) => [endpoint.endpointKey, endpoint])
    )

    this.store.writeNormalizedEndpoints(normalizedEndpoints)
    this.store.writeEndpointsByProvider(normalizedEndpoints)
  }

  async listEndpoints(filter?: {
    providerId?: string
    outputType?: 'image' | 'video'
  }): Promise<CanonicalEndpointDef[]> {
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
    return this.endpointsByKey.get(endpointKey) ?? null
  }

  private fromProviderConfigEndpoints(provider: ProviderConfig): CanonicalEndpointDef[] {
    const endpoints = provider.endpoints ?? []
    return endpoints.map((endpoint) => this.mapProviderEndpoint(provider, endpoint))
  }

  private fromProviderUserModels(provider: ProviderConfig): CanonicalEndpointDef[] {
    const userModels = this.store.readProviderModels(provider.providerId)
    return userModels
      .map((entry) => this.mapProviderUserModel(provider, entry))
      .filter((endpoint): endpoint is CanonicalEndpointDef => !!endpoint)
  }

  private mapProviderUserModel(
    provider: ProviderConfig,
    value: unknown
  ): CanonicalEndpointDef | null {
    if (!value || typeof value !== 'object') return null
    const model = value as {
      modelId?: unknown
      name?: unknown
      type?: unknown
      requestSchema?: unknown
      modelIdentityId?: unknown
    }

    const modelId = typeof model.modelId === 'string' ? model.modelId.trim() : ''
    if (!modelId) return null

    const modeInfo = this.inferModeInfo(
      typeof model.type === 'string' ? model.type : undefined,
      modelId
    )

    return {
      endpointKey: `${provider.providerId}.${modelId}.${modeInfo.outputType}`,
      providerId: provider.providerId,
      providerModelId: modelId,
      canonicalModelId:
        typeof model.modelIdentityId === 'string' ? model.modelIdentityId : undefined,
      displayName:
        typeof model.name === 'string' && model.name.trim().length > 0
          ? model.name.trim()
          : modelId,
      modes: modeInfo.modes,
      outputType: modeInfo.outputType,
      executionMode: provider.mode ?? 'remote-async',
      requestSchema: normalizeRequestSchema(model.requestSchema)
    }
  }

  private mapProviderEndpoint(
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

  private createDefaultLocalEndpoint(): CanonicalEndpointDef {
    return {
      endpointKey: DEFAULT_LOCAL_ENDPOINT_KEY,
      providerId: 'local',
      providerModelId: 'flux2-klein',
      displayName: 'FLUX.2 Klein (Local)',
      modes: ['text-to-image', 'image-to-image'],
      outputType: 'image',
      executionMode: 'queued-local',
      requestSchema: this.defaultRequestSchema()
    }
  }

  private inferModeInfo(
    type: string | undefined,
    modelId: string
  ): {
    modes: Array<'text-to-image' | 'image-to-image' | 'text-to-video' | 'image-to-video'>
    outputType: 'image' | 'video'
  } {
    const haystack = `${type ?? ''} ${modelId}`.toLowerCase()

    if (haystack.includes('video')) {
      return {
        modes: haystack.includes('image') ? ['image-to-video'] : ['text-to-video'],
        outputType: 'video'
      }
    }

    return {
      modes: haystack.includes('edit') || haystack.includes('image-to-image')
        ? ['image-to-image']
        : ['text-to-image'],
      outputType: 'image'
    }
  }

  private defaultRequestSchema(): CanonicalEndpointDef['requestSchema'] {
    return normalizeRequestSchema({
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
          minimum: 1,
          maximum: 64,
          default: 4
        },
        guidance: {
          type: 'number',
          title: 'Guidance',
          description: 'Classifier-free guidance scale',
          minimum: 1,
          maximum: 20,
          step: 0.1,
          default: 3.5
        },
        sampling_method: {
          type: 'string',
          title: 'Sampler',
          default: 'euler',
          ui: { hidden: true }
        },
        seed: {
          type: 'integer',
          title: 'Seed',
          description: 'Random seed (leave empty for random)',
          minimum: 0,
          maximum: 2147483647,
          ui: { hidden: true }
        },
        ref_image_ids: {
          type: 'array',
          title: 'Reference Media IDs',
          items: { type: 'string' },
          ui: { hidden: true, component: 'internal' }
        },
        ref_image_paths: {
          type: 'array',
          title: 'Reference Image Paths',
          items: { type: 'string' },
          ui: { hidden: true, component: 'internal' }
        }
      },
      required: ['prompt'],
      order: ['prompt', 'size', 'steps', 'guidance', 'seed', 'sampling_method']
    })
  }
}
