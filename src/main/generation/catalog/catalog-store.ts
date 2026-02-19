import * as fs from 'fs'
import * as path from 'path'
import { app } from 'electron'
import type { CanonicalEndpointDef } from '../../types'

export class CatalogStore {
  private getProfileRoot(): string {
    return app.getPath('userData')
  }

  getEndpointCatalogDir(): string {
    return path.join(this.getProfileRoot(), 'endpoint_catalog')
  }

  getModelFeedsDir(): string {
    return path.join(this.getProfileRoot(), 'model_feeds')
  }

  getProviderModelsDir(): string {
    return path.join(this.getProfileRoot(), 'provider_models')
  }

  ensureDirectories(): void {
    const dirs = [this.getEndpointCatalogDir(), this.getModelFeedsDir(), this.getProviderModelsDir()]
    for (const dir of dirs) {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
      }
    }
  }

  writeNormalizedEndpoints(endpoints: CanonicalEndpointDef[]): void {
    this.ensureDirectories()

    const outputPath = path.join(this.getEndpointCatalogDir(), 'endpoints.normalized.json')
    fs.writeFileSync(outputPath, JSON.stringify(endpoints, null, 2), 'utf8')
  }

  writeEndpointsByProvider(endpoints: CanonicalEndpointDef[]): void {
    this.ensureDirectories()

    const byProvider = endpoints.reduce<Record<string, CanonicalEndpointDef[]>>((acc, endpoint) => {
      if (!acc[endpoint.providerId]) acc[endpoint.providerId] = []
      acc[endpoint.providerId].push(endpoint)
      return acc
    }, {})

    const outputPath = path.join(this.getEndpointCatalogDir(), 'endpoints.by-provider.json')
    fs.writeFileSync(outputPath, JSON.stringify(byProvider, null, 2), 'utf8')
  }

  readRawFeed(providerId: string): unknown | null {
    this.ensureDirectories()
    const filePath = path.join(this.getModelFeedsDir(), `${providerId}.json`)
    if (!fs.existsSync(filePath)) return null

    try {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'))
    } catch {
      return null
    }
  }

  readProviderModels(providerId: string): unknown[] {
    this.ensureDirectories()
    const filePath = path.join(this.getProviderModelsDir(), `${providerId}.json`)
    if (!fs.existsSync(filePath)) return []

    try {
      const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as unknown
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }
}
