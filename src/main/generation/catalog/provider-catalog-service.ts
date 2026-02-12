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
      const fromConfig = this.fromProviderConfigEndpoints(provider)
      endpoints.push(...fromConfig)

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
    }

    if (!endpoints.some((endpoint) => endpoint.endpointKey === DEFAULT_LOCAL_ENDPOINT_KEY)) {
      endpoints.push(this.createDefaultLocalEndpoint())
    }

    const deduped = new Map<string, CanonicalEndpointDef>()
    for (const endpoint of endpoints) {
      deduped.set(endpoint.endpointKey, endpoint)
    }

    const normalizedEndpoints = Array.from(deduped.values())
    this.endpointsByKey = new Map(normalizedEndpoints.map((endpoint) => [endpoint.endpointKey, endpoint]))

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

  getDefaultLocalEndpointKey(): string {
    return DEFAULT_LOCAL_ENDPOINT_KEY
  }

  private fromProviderConfigEndpoints(provider: ProviderConfig): CanonicalEndpointDef[] {
    const endpoints = provider.endpoints ?? []
    return endpoints.map((endpoint) => this.mapProviderEndpoint(provider, endpoint))
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
      canonicalModelId: 'flux2-klein-4b',
      displayName: 'FLUX.2 Klein (Local)',
      modes: ['text-to-image', 'image-to-image'],
      outputType: 'image',
      executionMode: 'queued-local',
      requestSchema: this.defaultRequestSchema()
    }
  }

  private defaultRequestSchema(): CanonicalEndpointDef['requestSchema'] {
    return normalizeRequestSchema({
      properties: {
        prompt: {
          type: 'string',
          title: 'Prompt'
        },
        width: {
          type: 'integer',
          title: 'Width',
          minimum: 256,
          maximum: 2048,
          step: 64,
          default: 1024
        },
        height: {
          type: 'integer',
          title: 'Height',
          minimum: 256,
          maximum: 2048,
          step: 64,
          default: 1024
        },
        steps: {
          type: 'integer',
          title: 'Steps',
          minimum: 1,
          maximum: 64,
          default: 4
        },
        guidance: {
          type: 'number',
          title: 'Guidance',
          minimum: 1,
          maximum: 20,
          step: 0.1,
          default: 3.5
        },
        sampling_method: {
          type: 'string',
          title: 'Sampler',
          default: 'euler'
        },
        ref_image_ids: {
          type: 'array',
          title: 'Reference Media IDs',
          items: { type: 'string' }
        },
        ref_image_paths: {
          type: 'array',
          title: 'Reference Image Paths',
          items: { type: 'string' }
        }
      },
      required: ['prompt', 'width', 'height'],
      order: ['prompt', 'width', 'height', 'steps', 'guidance', 'sampling_method']
    })
  }
}
