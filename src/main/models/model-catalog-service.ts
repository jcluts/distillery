import * as path from 'path'
import { app } from 'electron'
import type { ModelCatalog, ModelDefinition } from './types'
import { loadEditableJsonConfig } from '../config/config-file-utils'

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

  loadCatalog(forceRefresh = false): ModelCatalog {
    if (this.cache && !forceRefresh) {
      return this.cache
    }

    const bundled = getBundledCatalog()
    this.cache = loadEditableJsonConfig<ModelCatalog>({
      configName: 'model-catalog',
      bundledDefault: bundled,
      runtimePath: this.getRuntimeCatalogPath(),
      isValid: isModelCatalog
    })

    return this.cache
  }

  getModel(modelId: string): ModelDefinition | undefined {
    return this.loadCatalog().models.find((model) => model.id === modelId)
  }
}
