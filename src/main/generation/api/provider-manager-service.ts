import * as fs from 'fs'
import * as path from 'path'
import { app } from 'electron'
import { getDatabase } from '../../db/connection'
import * as settingsRepo from '../../db/repositories/settings'
import type { AppSettings } from '../../types'
import type { UserModelSource, ProviderCatalogService } from '../catalog/provider-catalog-service'
import type { ModelIdentityService } from '../catalog/model-identity-service'
import type { ProviderConfigService, ProviderConfig } from '../catalog/provider-config-service'
import { ApiClient } from './api-client'
import type { ProviderModel, SearchResult } from './types'

function isProviderModel(value: unknown): value is ProviderModel {
  if (!value || typeof value !== 'object') return false
  const maybe = value as Partial<ProviderModel>
  return (
    typeof maybe.modelId === 'string' &&
    typeof maybe.name === 'string' &&
    typeof maybe.providerId === 'string' &&
    !!maybe.requestSchema &&
    typeof maybe.requestSchema === 'object'
  )
}

/**
 * Orchestrates provider state: configs, API keys, model browsing, and user model persistence.
 * Implements UserModelSource so the catalog can pull user models without a circular dependency.
 */
export class ProviderManagerService implements UserModelSource {
  private configService: ProviderConfigService
  private identityService: ModelIdentityService
  private catalogService: ProviderCatalogService | null = null
  private userModelsByProvider = new Map<string, ProviderModel[]>()

  constructor(configService: ProviderConfigService, identityService: ModelIdentityService) {
    this.configService = configService
    this.identityService = identityService
  }

  /**
   * Called once during init, after both services exist.
   * Registers this service as the catalog's user model source.
   */
  setCatalogService(catalogService: ProviderCatalogService): void {
    this.catalogService = catalogService
    catalogService.setUserModelSource(this)
  }

  // ---------------------------------------------------------------------------
  // UserModelSource implementation (called by ProviderCatalogService)
  // ---------------------------------------------------------------------------

  getProvidersWithUserModels(): Array<{ providerId: string; models: ProviderModel[] }> {
    // Ensure all remote providers have their user models loaded
    const providers = this.getProviders()
    for (const p of providers) {
      if (!this.userModelsByProvider.has(p.providerId)) {
        this.loadUserModelsFromDisk(p.providerId)
      }
    }

    const result: Array<{ providerId: string; models: ProviderModel[] }> = []
    for (const [providerId, models] of this.userModelsByProvider) {
      if (models.length > 0) {
        result.push({ providerId, models })
      }
    }
    return result
  }

  // ---------------------------------------------------------------------------
  // Provider queries
  // ---------------------------------------------------------------------------

  getProviders(): ProviderConfig[] {
    return this.configService
      .loadMergedProviderConfigs({ activeOnly: false })
      .filter((provider) => provider.mode === 'remote-async')
  }

  getProviderConfig(providerId: string): ProviderConfig | null {
    return this.getProviders().find((p) => p.providerId === providerId) ?? null
  }

  getApiKey(providerId: string): string {
    const provider = this.getProviderConfig(providerId)
    if (!provider?.auth?.settingsKey) return ''
    const db = getDatabase()
    return settingsRepo.getSetting(db, provider.auth.settingsKey as keyof AppSettings) as string
  }

  isProviderConfigured(providerId: string): boolean {
    return this.getApiKey(providerId).trim().length > 0
  }

  // ---------------------------------------------------------------------------
  // Model browsing (delegates to ApiClient)
  // ---------------------------------------------------------------------------

  async searchModels(providerId: string, query: string): Promise<SearchResult> {
    const client = this.createApiClient(providerId)
    return await client.searchModels(query)
  }

  async listModels(providerId: string): Promise<ProviderModel[]> {
    const client = this.createApiClient(providerId)
    const models = await client.fetchModelList()
    return models.map((model) => this.attachIdentity(model))
  }

  async fetchModelDetail(providerId: string, modelId: string): Promise<ProviderModel | null> {
    const client = this.createApiClient(providerId)
    const model = await client.fetchModelDetail(modelId)
    return model ? this.attachIdentity(model) : null
  }

  // ---------------------------------------------------------------------------
  // User model management
  // ---------------------------------------------------------------------------

  getUserModels(providerId: string): ProviderModel[] {
    if (!this.userModelsByProvider.has(providerId)) {
      this.loadUserModelsFromDisk(providerId)
    }
    return [...(this.userModelsByProvider.get(providerId) ?? [])]
  }

  addUserModel(providerId: string, model: ProviderModel): void {
    const current = this.getUserModels(providerId)
    const deduped = current.filter((entry) => entry.modelId !== model.modelId)
    deduped.push(this.attachIdentity(model))
    this.userModelsByProvider.set(providerId, deduped)
    this.persistUserModels(providerId)
    this.catalogService?.invalidate()
  }

  removeUserModel(providerId: string, modelId: string): void {
    const current = this.getUserModels(providerId)
    const next = current.filter((entry) => entry.modelId !== modelId)
    this.userModelsByProvider.set(providerId, next)
    this.persistUserModels(providerId)
    this.catalogService?.invalidate()
  }

  // ---------------------------------------------------------------------------
  // Connection testing
  // ---------------------------------------------------------------------------

  async testConnection(providerId: string): Promise<{ valid: boolean; error?: string }> {
    try {
      const provider = this.getProviderConfig(providerId)
      if (!provider) return { valid: false, error: `Unknown provider: ${providerId}` }

      const client = this.createApiClient(providerId)
      if (provider.browse?.mode === 'list') {
        await client.fetchModelList()
      } else {
        await client.searchModels('flux')
      }
      return { valid: true }
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : String(error)
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private createApiClient(providerId: string): ApiClient {
    const provider = this.getProviderConfig(providerId)
    if (!provider) throw new Error(`Unknown provider: ${providerId}`)

    const apiKey = this.getApiKey(providerId)
    if (provider.auth && !apiKey.trim()) {
      throw new Error(
        `Missing API key for provider: ${provider.displayName ?? provider.providerId}`
      )
    }
    return new ApiClient(provider, apiKey)
  }

  private attachIdentity(model: ProviderModel): ProviderModel {
    if (model.modelIdentityId) return model
    const identityId = this.identityService.findIdentityId(model.modelId, model.providerId)
    return identityId ? { ...model, modelIdentityId: identityId } : model
  }

  private getProviderModelsDir(): string {
    return path.join(app.getPath('userData'), 'provider_models')
  }

  private getProviderModelsPath(providerId: string): string {
    return path.join(this.getProviderModelsDir(), `${providerId}.json`)
  }

  private persistUserModels(providerId: string): void {
    const filePath = this.getProviderModelsPath(providerId)
    const models = this.userModelsByProvider.get(providerId) ?? []
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    fs.writeFileSync(filePath, JSON.stringify(models, null, 2), 'utf8')
  }

  private loadUserModelsFromDisk(providerId: string): void {
    const filePath = this.getProviderModelsPath(providerId)
    if (!fs.existsSync(filePath)) {
      this.userModelsByProvider.set(providerId, [])
      return
    }

    try {
      const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as unknown
      if (!Array.isArray(parsed)) {
        this.userModelsByProvider.set(providerId, [])
        return
      }
      const models = parsed
        .filter((entry): entry is ProviderModel => isProviderModel(entry))
        .map((model) => this.attachIdentity(model))
      this.userModelsByProvider.set(providerId, models)
    } catch {
      this.userModelsByProvider.set(providerId, [])
    }
  }
}
