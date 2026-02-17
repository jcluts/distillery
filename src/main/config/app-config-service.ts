import * as path from 'path'
import { app } from 'electron'
import {
  cloneJson,
  loadEditableJsonConfig,
  shouldUseProfileConfigFiles,
  writeJsonFile
} from './config-file-utils'

interface AppConfigFile {
  configVersion: number
  model_base_path: string
  cn_engine_base_path: string
}

export interface ResolvedAppConfigPaths {
  modelBasePath: string
  cnEngineBasePath: string
  cnEngineExecutablePath: string
}

const bundledAppConfigModules = import.meta.glob('./app-config.json', {
  eager: true,
  import: 'default'
}) as Record<string, AppConfigFile>

function getBundledAppConfig(): AppConfigFile {
  const config = Object.values(bundledAppConfigModules)[0]
  if (!config || !isAppConfigFile(config)) {
    throw new Error('Bundled app config is missing or invalid')
  }
  return cloneJson(config)
}

function isAppConfigFile(value: unknown): value is AppConfigFile {
  if (!value || typeof value !== 'object') return false
  const maybe = value as Partial<AppConfigFile>
  return (
    typeof maybe.configVersion === 'number' &&
    typeof maybe.model_base_path === 'string' &&
    typeof maybe.cn_engine_base_path === 'string'
  )
}

function getResourcesRoot(): string {
  if (app.isPackaged) {
    return process.resourcesPath
  }

  return path.join(app.getAppPath(), 'resources')
}

function expandPathToken(input: string, token: string, replacement: string): string {
  const normalizedInput = input.replace(/\\/g, '/')
  if (normalizedInput === token) {
    return replacement
  }

  const prefix = `${token}/`
  if (!normalizedInput.startsWith(prefix)) {
    return input
  }

  const suffix = normalizedInput.slice(prefix.length)
  const segments = suffix.length > 0 ? suffix.split('/').filter(Boolean) : []
  return path.join(replacement, ...segments)
}

function resolveConfigPath(rawPath: string): string {
  const trimmed = rawPath.trim()
  if (!trimmed) return ''

  const userDataPath = app.getPath('userData')
  const appPath = app.getAppPath()
  const resourcesPath = getResourcesRoot()

  let expanded = trimmed
  expanded = expandPathToken(expanded, '$USER_DATA', userDataPath)
  expanded = expandPathToken(expanded, '$APP', appPath)
  expanded = expandPathToken(expanded, '$RESOURCES', resourcesPath)

  if (path.isAbsolute(expanded)) {
    return path.normalize(expanded)
  }

  return path.normalize(path.join(userDataPath, expanded))
}

function getCnEngineExecutableName(): string {
  return process.platform === 'win32' ? 'cn-engine.exe' : 'cn-engine'
}

export class AppConfigService {
  private rawCache: AppConfigFile | null = null
  private resolvedCache: ResolvedAppConfigPaths | null = null

  getRuntimeConfigPath(): string {
    return path.join(app.getPath('userData'), 'app-config.json')
  }

  loadRawConfig(forceRefresh = false): AppConfigFile {
    if (this.rawCache && !forceRefresh) {
      return cloneJson(this.rawCache)
    }

    const bundledDefault = getBundledAppConfig()
    const loaded = loadEditableJsonConfig<AppConfigFile>({
      configName: 'app-config',
      bundledDefault,
      runtimePath: this.getRuntimeConfigPath(),
      isValid: isAppConfigFile
    })

    this.rawCache = loaded
    return cloneJson(this.rawCache)
  }

  loadResolvedPaths(forceRefresh = false): ResolvedAppConfigPaths {
    if (this.resolvedCache && !forceRefresh) {
      return { ...this.resolvedCache }
    }

    const raw = this.loadRawConfig(forceRefresh)
    const modelBasePath = resolveConfigPath(raw.model_base_path)
    const cnEngineBasePath = resolveConfigPath(raw.cn_engine_base_path)

    this.resolvedCache = {
      modelBasePath,
      cnEngineBasePath,
      cnEngineExecutablePath: cnEngineBasePath
        ? path.join(cnEngineBasePath, getCnEngineExecutableName())
        : ''
    }

    return { ...this.resolvedCache }
  }

  updatePaths(updates: {
    modelBasePath?: string
    cnEngineBasePath?: string
  }): ResolvedAppConfigPaths {
    const current = this.loadRawConfig()

    const next: AppConfigFile = {
      ...current,
      model_base_path: updates.modelBasePath ?? current.model_base_path,
      cn_engine_base_path: updates.cnEngineBasePath ?? current.cn_engine_base_path
    }

    this.rawCache = next
    this.resolvedCache = null

    if (shouldUseProfileConfigFiles()) {
      writeJsonFile(this.getRuntimeConfigPath(), next)
    }

    return this.loadResolvedPaths()
  }
}
