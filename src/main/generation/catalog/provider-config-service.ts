import * as fs from 'fs'
import * as path from 'path'
import { app } from 'electron'

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

  loadBuiltInConfigs(): ProviderConfig[] {
    return Object.values(builtInProviderModules).filter(
      (config) => !!config.providerId
    )
  }

  loadProfileOverrides(): ProviderConfig[] {
    const dir = this.getProviderOverridesDir()
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
      return []
    }

    const files = fs.readdirSync(dir).filter((name) => name.endsWith('.json'))
    const configs: ProviderConfig[] = []

    for (const file of files) {
      const abs = path.join(dir, file)
      try {
        const parsed = JSON.parse(fs.readFileSync(abs, 'utf8')) as ProviderConfig
        if (parsed.providerId) {
          configs.push(parsed)
        }
      } catch (error) {
        console.warn(`[ProviderConfigService] Failed to read provider override ${abs}`, error)
      }
    }

    return configs
  }

  loadMergedProviderConfigs(): ProviderConfig[] {
    const builtIns = this.loadBuiltInConfigs()
    const overrides = this.loadProfileOverrides()

    const map = new Map<string, ProviderConfig>()

    for (const config of builtIns) {
      map.set(config.providerId, config)
    }

    for (const override of overrides) {
      const existing = map.get(override.providerId)
      map.set(
        override.providerId,
        existing ? mergeProviderConfig(existing, override) : override
      )
    }

    return Array.from(map.values()).filter((config) => config.enabled !== false)
  }
}
