import * as path from 'path'
import * as fs from 'fs'
import { app } from 'electron'
import { loadEditableJsonConfig } from '../config/config-file-utils'
import bundledConfig from '../defaults/upscale-models.json'
import type { UpscaleModelConfig, UpscaleModelInfo } from '../types'

interface UpscaleModelsFile {
  configVersion: number
  models: UpscaleModelConfig[]
}

function isUpscaleModelsFile(value: unknown): value is UpscaleModelsFile {
  if (!value || typeof value !== 'object') return false
  const maybe = value as Partial<UpscaleModelsFile>
  return typeof maybe.configVersion === 'number' && Array.isArray(maybe.models)
}

function getResourcesRoot(): string {
  return app.isPackaged ? process.resourcesPath : path.join(app.getAppPath(), 'resources')
}

export class UpscaleModelService {
  private config: UpscaleModelsFile | null = null

  private getRuntimePath(): string {
    return path.join(app.getPath('userData'), 'upscale-models.json')
  }

  private loadConfig(): UpscaleModelsFile {
    if (this.config) return this.config

    this.config = loadEditableJsonConfig<UpscaleModelsFile>({
      configName: 'upscale-models',
      bundledDefault: bundledConfig as UpscaleModelsFile,
      runtimePath: this.getRuntimePath(),
      isValid: isUpscaleModelsFile
    })

    return this.config
  }

  private resolveModelPath(relativeFile: string): string {
    return path.join(getResourcesRoot(), 'models', relativeFile)
  }

  getModels(): UpscaleModelInfo[] {
    const config = this.loadConfig()
    return config.models
      .filter((m) => m.enabled)
      .map((m) => ({
        id: m.id,
        name: m.name,
        description: m.description,
        supportedScales: m.supportedScales,
        available: fs.existsSync(this.resolveModelPath(m.file))
      }))
  }

  getModelConfig(modelId: string): UpscaleModelConfig | null {
    const config = this.loadConfig()
    return config.models.find((m) => m.id === modelId) ?? null
  }

  resolveModelAbsolutePath(modelId: string): string | null {
    const model = this.getModelConfig(modelId)
    if (!model) return null
    const absPath = this.resolveModelPath(model.file)
    return fs.existsSync(absPath) ? absPath : null
  }
}
