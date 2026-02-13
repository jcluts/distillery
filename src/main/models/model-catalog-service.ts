import * as fs from 'fs'
import * as path from 'path'
import { app } from 'electron'
import type { ModelCatalog, ModelDefinition } from './types'

const bundledCatalogModules = import.meta.glob('../config/model-catalog.json', {
  eager: true,
  import: 'default'
}) as Record<string, ModelCatalog>

function getBundledCatalog(): ModelCatalog {
  const catalog = Object.values(bundledCatalogModules)[0]
  if (!catalog || !Array.isArray(catalog.models)) {
    throw new Error('Bundled model catalog is missing or invalid')
  }

  return catalog
}

function isModelCatalog(value: unknown): value is ModelCatalog {
  if (!value || typeof value !== 'object') return false
  const maybe = value as Partial<ModelCatalog>
  return typeof maybe.catalogVersion === 'number' && Array.isArray(maybe.models)
}

export class ModelCatalogService {
  private cache: ModelCatalog | null = null

  getRuntimeCatalogPath(): string {
    return path.join(app.getPath('userData'), 'model-catalog.json')
  }

  ensureRuntimeCatalogFile(): string {
    const runtimePath = this.getRuntimeCatalogPath()
    if (fs.existsSync(runtimePath)) {
      return runtimePath
    }

    const bundled = getBundledCatalog()
    fs.mkdirSync(path.dirname(runtimePath), { recursive: true })
    fs.writeFileSync(runtimePath, JSON.stringify(bundled, null, 2), 'utf8')
    return runtimePath
  }

  loadCatalog(forceRefresh = false): ModelCatalog {
    if (this.cache && !forceRefresh) {
      return this.cache
    }

    const runtimePath = this.ensureRuntimeCatalogFile()

    try {
      const raw = fs.readFileSync(runtimePath, 'utf8')
      const parsed = JSON.parse(raw) as unknown
      if (!isModelCatalog(parsed)) {
        throw new Error('Invalid model catalog shape')
      }

      this.cache = parsed
      return this.cache
    } catch (error) {
      console.warn(
        '[ModelCatalogService] Failed to read runtime catalog, re-seeding from bundled default:',
        error
      )
      const bundled = getBundledCatalog()
      fs.writeFileSync(runtimePath, JSON.stringify(bundled, null, 2), 'utf8')
      this.cache = bundled
      return this.cache
    }
  }

  getModel(modelId: string): ModelDefinition | undefined {
    return this.loadCatalog().models.find((model) => model.id === modelId)
  }
}
