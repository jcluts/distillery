import * as path from 'path'
import { app } from 'electron'
import type { ModelCatalog, ModelDefinition } from './types'
import { loadEditableJsonConfig } from '../config/config-file-utils'
import bundledModelCatalog from '../defaults/model-catalog.json'

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

    this.cache = loadEditableJsonConfig<ModelCatalog>({
      configName: 'model-catalog',
      bundledDefault: bundledModelCatalog as unknown as ModelCatalog,
      runtimePath: this.getRuntimeCatalogPath(),
      isValid: isModelCatalog
    })

    return this.cache
  }

  getModel(modelId: string): ModelDefinition | undefined {
    return this.loadCatalog().models.find((model) => model.id === modelId)
  }
}
