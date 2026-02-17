import * as path from 'path'
import { app } from 'electron'
import {
  readJsonConfigsFromDirectory,
  seedRuntimeJsonDirectory,
  shouldUseProfileConfigFiles
} from '../../config/config-file-utils'

export interface ProviderEndpointConfig {
  endpointKey: string
  providerModelId: string
  canonicalModelId?: string
  displayName: string
  modes: Array<'text-to-image' | 'image-to-image' | 'text-to-video' | 'image-to-video'>
  outputType: 'image' | 'video'
  executionMode: 'queued-local' | 'remote-async'
  requestSchema: unknown
  uiSchema?: unknown
}

export interface ProviderConfig {
  providerId: string
  displayName?: string
  enabled?: boolean
  mode?: 'queued-local' | 'remote-async'
  adapter?: 'wavespeed' | 'fal' | 'replicate'
  feedFile?: string
  endpoints?: ProviderEndpointConfig[]
  auth?: Record<string, unknown>
  uploadStrategy?: Record<string, unknown>
  asyncStrategy?: Record<string, unknown>
}

const builtInProviderModules = import.meta.glob('../../config/providers/*.json', {
  eager: true,
  import: 'default'
}) as Record<string, ProviderConfig>

function isProviderConfig(value: unknown): value is ProviderConfig {
  if (!value || typeof value !== 'object') return false
  const maybe = value as Partial<ProviderConfig>
  return typeof maybe.providerId === 'string' && maybe.providerId.trim().length > 0
}

function mergeProviderConfig(base: ProviderConfig, override: ProviderConfig): ProviderConfig {
  return {
    ...base,
    ...override,
    auth: {
      ...(base.auth ?? {}),
      ...(override.auth ?? {})
    },
    uploadStrategy: {
      ...(base.uploadStrategy ?? {}),
      ...(override.uploadStrategy ?? {})
    },
    asyncStrategy: {
      ...(base.asyncStrategy ?? {}),
      ...(override.asyncStrategy ?? {})
    },
    endpoints: override.endpoints ?? base.endpoints
  }
}

export class ProviderConfigService {
  getProviderOverridesDir(): string {
    return path.join(app.getPath('userData'), 'api-providers')
  }

  private getBuiltInConfigsByFileName(): Record<string, ProviderConfig> {
    const defaultsByFileName: Record<string, ProviderConfig> = {}

    for (const [modulePath, config] of Object.entries(builtInProviderModules)) {
      if (!isProviderConfig(config)) continue

      const fileName = modulePath.split('/').pop() ?? `${config.providerId}.json`
      defaultsByFileName[fileName] = config
    }

    return defaultsByFileName
  }

  private seedProfileProviderFiles(): void {
    if (!shouldUseProfileConfigFiles()) {
      return
    }

    const defaultsByFileName = this.getBuiltInConfigsByFileName()
    seedRuntimeJsonDirectory(defaultsByFileName, this.getProviderOverridesDir())
  }

  loadBuiltInConfigs(): ProviderConfig[] {
    return Object.values(builtInProviderModules).filter((config) => isProviderConfig(config))
  }

  loadProfileOverrides(): ProviderConfig[] {
    if (!shouldUseProfileConfigFiles()) {
      return []
    }

    this.seedProfileProviderFiles()
    return readJsonConfigsFromDirectory<ProviderConfig>({
      dirPath: this.getProviderOverridesDir(),
      configName: 'provider-config',
      isValid: isProviderConfig
    })
  }

  loadMergedProviderConfigs(): ProviderConfig[] {
    const builtIns = this.loadBuiltInConfigs()

    if (!shouldUseProfileConfigFiles()) {
      return builtIns.filter((config) => config.enabled !== false)
    }

    const overrides = this.loadProfileOverrides()

    const map = new Map<string, ProviderConfig>()

    for (const config of builtIns) {
      map.set(config.providerId, config)
    }

    for (const override of overrides) {
      const existing = map.get(override.providerId)
      map.set(override.providerId, existing ? mergeProviderConfig(existing, override) : override)
    }

    return Array.from(map.values()).filter((config) => config.enabled !== false)
  }
}
