import * as path from 'path'
import * as fs from 'fs'
import { app } from 'electron'
import { loadEditableJsonConfig } from '../config/config-file-utils'
import bundledConfig from '../defaults/upscale-models.json'
import type {
  UpscaleBackend,
  UpscaleBackendPreference,
  UpscaleModelArtifactConfig,
  UpscaleModelConfig,
  UpscaleModelInfo
} from '../types'

interface UpscaleModelsFile {
  configVersion: number
  models: UpscaleModelConfig[]
}

export interface ResolvedUpscaleModel {
  config: UpscaleModelConfig
  backend: UpscaleBackend
  artifact: UpscaleModelArtifactConfig
  modelPath: string
}

function isUpscaleArtifactConfig(value: unknown): value is UpscaleModelArtifactConfig {
  if (!value || typeof value !== 'object') return false
  const maybe = value as Partial<UpscaleModelArtifactConfig>
  return Array.isArray(maybe.files) && maybe.files.every((entry) => typeof entry === 'string')
}

function isUpscaleModelsFile(value: unknown): value is UpscaleModelsFile {
  if (!value || typeof value !== 'object') return false
  const maybe = value as Partial<UpscaleModelsFile>
  return (
    typeof maybe.configVersion === 'number' &&
    Array.isArray(maybe.models) &&
    maybe.models.every((model) => {
      const candidate = model as Partial<UpscaleModelConfig>
      return (
        typeof candidate.id === 'string' &&
        typeof candidate.name === 'string' &&
        typeof candidate.description === 'string' &&
        typeof candidate.nativeScale === 'number' &&
        Array.isArray(candidate.supportedScales) &&
        typeof candidate.enabled === 'boolean' &&
        !!candidate.backends &&
        typeof candidate.backends === 'object' &&
        Object.values(candidate.backends).every(
          (artifact) => artifact === undefined || isUpscaleArtifactConfig(artifact)
        )
      )
    })
  )
}

function getResourcesRoot(): string {
  return app.isPackaged ? process.resourcesPath : path.join(app.getAppPath(), 'resources')
}

function getModelRoots(): string[] {
  return [path.join(app.getPath('userData'), 'models'), path.join(getResourcesRoot(), 'models')]
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

  private resolveModelPath(relativeFile: string): string | null {
    for (const root of getModelRoots()) {
      const absPath = path.join(root, relativeFile)
      if (fs.existsSync(absPath)) {
        return absPath
      }
    }

    return null
  }

  getModels(preference: UpscaleBackendPreference = 'auto'): UpscaleModelInfo[] {
    const config = this.loadConfig()
    return config.models
      .filter((m) => m.enabled)
      .map((model) => {
        const resolved = this.resolveExecutionModel(model.id, preference)
        return {
          id: model.id,
          name: model.name,
          description: model.description,
          supportedScales: model.supportedScales,
          available: resolved !== null,
          backend: resolved?.backend
        }
      })
  }

  getModelConfig(modelId: string): UpscaleModelConfig | null {
    const config = this.loadConfig()
    return config.models.find((m) => m.id === modelId) ?? null
  }

  resolveExecutionModel(
    modelId: string,
    preference: UpscaleBackendPreference = 'auto'
  ): ResolvedUpscaleModel | null {
    const model = this.getModelConfig(modelId)
    if (!model) return null

    const backendOrder: UpscaleBackend[] =
      preference === 'auto' ? ['onnx', 'cn-engine'] : [preference]

    for (const backend of backendOrder) {
      const artifact = model.backends[backend]
      if (!artifact) {
        continue
      }

      for (const candidate of artifact.files) {
        const modelPath = this.resolveModelPath(candidate)
        if (!modelPath) {
          continue
        }

        return {
          config: model,
          backend,
          artifact,
          modelPath
        }
      }
    }

    return null
  }
}
