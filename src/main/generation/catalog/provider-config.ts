import * as path from 'path'
import { app } from 'electron'
import {
  readJsonConfigsFromDirectory,
  seedRuntimeJsonDirectory
} from '../../config/config-file-utils'
import type { GenerationMode } from '../../types'

export interface ProviderStaticModelConfig {
  modelId: string
  name: string
  description?: string
  type?: GenerationMode
  modes?: GenerationMode[]
  outputType?: 'image' | 'video'
  requestSchema: unknown
  modelIdentityId?: string
}

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
  adapter?: 'wavespeed' | 'fal' | 'replicate' | 'venice' | 'runware'
  feedFile?: string
  staticModels?: ProviderStaticModelConfig[]
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
    method: 'GET' | 'QUERY' | 'POST'
    queryParam?: string
    limitParam?: string
    extraParams?: Record<string, string>
    maxResults?: number
    taskType?: string
    responsePath?: string
    detailEndpoint?: string
    detailQueryParam?: string
    searchOnly?: boolean
  }
  browse?: {
    mode: 'search' | 'list'
  }
  upload?: {
    endpoint: string
    method: 'multipart' | 'json' | 'signed-url-put'
    fileField?: string
    extraFields?: Record<string, string>
    responseField: string
    uploadUrlField?: string
  }
  publicUpload?: {
    providerId: string
  }
  async?: {
    enabled: boolean
    modes?: GenerationMode[]
    requestIdPath: string
    pollEndpoint: string
    pollMethod?: 'GET' | 'POST'
    pollBody?: unknown
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
    endpointTemplatesByMode?: Partial<Record<GenerationMode, string>>
    payloadStyle?: 'flat' | 'nested-input' | 'input-only' | 'task-array'
    modelField?: string
    inputField?: string
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

function mergeOptionalObject<T extends object>(
  base: T | undefined,
  override: T | undefined
): T | undefined {
  if (!base && !override) return undefined
  return {
    ...(base ?? {}),
    ...(override ?? {})
  } as T
}

function mergeProviderConfig(base: ProviderConfig, override: ProviderConfig): ProviderConfig {
  const merged = {
    ...base,
    ...override,
    auth: mergeOptionalObject(base.auth, override.auth),
    search: mergeOptionalObject(base.search, override.search),
    browse: mergeOptionalObject(base.browse, override.browse),
    upload: mergeOptionalObject(base.upload, override.upload),
    publicUpload: mergeOptionalObject(base.publicUpload, override.publicUpload),
    async: mergeOptionalObject(base.async, override.async),
    request: mergeOptionalObject(base.request, override.request),
    staticModels: override.staticModels ?? base.staticModels,
    endpoints: override.endpoints ?? base.endpoints
  }

  return refreshBuiltInProviderConfig(merged, base)
}

function refreshBuiltInProviderConfig(
  merged: ProviderConfig,
  base: ProviderConfig
): ProviderConfig {
  if (merged.providerId === 'ninjachat') {
    return {
      ...merged,
      baseUrl: base.baseUrl ?? merged.baseUrl,
      publicUpload: base.publicUpload ?? merged.publicUpload,
      request: {
        ...(merged.request ?? {}),
        ...(base.request ?? {}),
        endpointTemplatesByMode: {
          ...(merged.request?.endpointTemplatesByMode ?? {}),
          ...(base.request?.endpointTemplatesByMode ?? {})
        }
      },
      async: base.async
        ? {
            ...(merged.async ?? {}),
            ...(base.async ?? {}),
            pollBody: {
              ...(merged.async?.pollBody ?? {}),
              ...(base.async.pollBody ?? {})
            }
          }
        : merged.async,
      staticModels: base.staticModels ?? merged.staticModels
    }
  }

  if (merged.providerId === 'runware') {
    return {
      ...merged,
      baseUrl: base.baseUrl ?? merged.baseUrl,
      search: base.search
        ? {
            ...base.search,
            ...merged.search,
            endpoint: base.search.endpoint,
            taskType: base.search.taskType,
            responsePath: base.search.responsePath,
            extraParams: {
              ...(merged.search?.extraParams ?? {}),
              ...(base.search.extraParams ?? {})
            }
          }
        : merged.search,
      request: {
        ...(merged.request ?? {}),
        ...(base.request ?? {})
      },
      async: base.async
        ? {
            ...(merged.async ?? {}),
            ...(base.async ?? {}),
            pollBody: base.async.pollBody ?? merged.async?.pollBody
          }
        : merged.async,
      staticModels: base.staticModels ?? merged.staticModels
    }
  }

  if (merged.providerId !== 'venice') return merged

  return {
    ...merged,
    search: base.search
      ? {
          ...base.search,
          ...merged.search,
          extraParams: {
            ...(merged.search?.extraParams ?? {}),
            ...(base.search.extraParams ?? {})
          }
        }
      : merged.search,
    request: {
      ...(merged.request ?? {}),
      ...(base.request ?? {}),
      endpointTemplatesByMode: {
        ...(merged.request?.endpointTemplatesByMode ?? {}),
        ...(base.request?.endpointTemplatesByMode ?? {})
      }
    },
    async: base.async
      ? {
          ...(merged.async ?? {}),
          ...(base.async ?? {}),
          pollBody: {
            ...(merged.async?.pollBody ?? {}),
            ...(base.async.pollBody ?? {})
          }
        }
      : merged.async
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
