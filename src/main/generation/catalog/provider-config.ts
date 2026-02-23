import * as path from 'path'
import { app } from 'electron'
import {
  readJsonConfigsFromDirectory,
  seedRuntimeJsonDirectory
} from '../../config/config-file-utils'
import type { GenerationMode } from '../../types'

export interface ProviderEndpointConfig {
  endpointKey: string
  providerModelId: string
  canonicalModelId?: string // preserved for provider config JSON compatibility
  modelIdentityId?: string
  displayName: string
  modes: GenerationMode[]
  outputType: 'image' | 'video'
  executionMode: 'queued-local' | 'remote-async'
  requestSchema: unknown
  uiSchema?: unknown
}

export interface ProviderConfig {
  providerId: string
  displayName?: string
  enabled?: boolean
  executionMode?: 'queued-local' | 'remote-async'
  adapter?: 'wavespeed' | 'fal' | 'replicate'
  feedFile?: string
  endpoints?: ProviderEndpointConfig[]
  baseUrl?: string
  auth?: {
    type: 'bearer' | 'key'
    header?: string
    prefix?: string
    settingsKey: string
  }
  search?: {
    endpoint: string
    method: 'GET' | 'QUERY'
    queryParam?: string
    limitParam?: string
    extraParams?: Record<string, string>
    maxResults?: number
    detailEndpoint?: string
    detailQueryParam?: string
    searchOnly?: boolean
  }
  browse?: {
    mode: 'search' | 'list'
  }
  upload?: {
    endpoint: string
    method: 'multipart' | 'json'
    fileField?: string
    responseField: string
  }
  async?: {
    enabled: boolean
    requestIdPath: string
    pollEndpoint: string
    pollUrlPath?: string
    pollInterval?: number
    maxPollTime?: number
    statusPath: string
    completedValue: string
    failedValue: string
    errorPath?: string
    outputsPath: string
  }
  request?: {
    endpointTemplate?: string
  }
}

const builtInProviderModules = import.meta.glob('../../defaults/providers/*.json', {
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
    } as ProviderConfig['auth'],
    search: {
      ...(base.search ?? {}),
      ...(override.search ?? {})
    } as ProviderConfig['search'],
    browse: {
      ...(base.browse ?? {}),
      ...(override.browse ?? {})
    } as ProviderConfig['browse'],
    upload: {
      ...(base.upload ?? {}),
      ...(override.upload ?? {})
    } as ProviderConfig['upload'],
    async: {
      ...(base.async ?? {}),
      ...(override.async ?? {})
    } as ProviderConfig['async'],
    request: {
      ...(base.request ?? {}),
      ...(override.request ?? {})
    } as ProviderConfig['request'],
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
    const defaultsByFileName = this.getBuiltInConfigsByFileName()
    seedRuntimeJsonDirectory(defaultsByFileName, this.getProviderOverridesDir())
  }

  loadBuiltInConfigs(): ProviderConfig[] {
    return Object.values(builtInProviderModules).filter((config) => isProviderConfig(config))
  }

  loadProfileOverrides(): ProviderConfig[] {
    this.seedProfileProviderFiles()
    return readJsonConfigsFromDirectory<ProviderConfig>({
      dirPath: this.getProviderOverridesDir(),
      configName: 'provider-config',
      isValid: isProviderConfig
    })
  }

  loadMergedProviderConfigs(options?: { activeOnly?: boolean }): ProviderConfig[] {
    const activeOnly = options?.activeOnly !== false
    const builtIns = this.loadBuiltInConfigs()
    const overrides = this.loadProfileOverrides()

    const map = new Map<string, ProviderConfig>()

    for (const config of builtIns) {
      map.set(config.providerId, config)
    }

    for (const override of overrides) {
      const existing = map.get(override.providerId)
      map.set(override.providerId, existing ? mergeProviderConfig(existing, override) : override)
    }

    const merged = Array.from(map.values())
    return activeOnly ? merged.filter((config) => config.enabled !== false) : merged
  }
}
