import * as path from 'path'
import { app } from 'electron'
import { cloneJson, loadEditableJsonConfig, writeJsonFile } from './config-file-utils'
import bundledAppConfig from '../defaults/app-config.json'

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
  return app.isPackaged ? process.resourcesPath : path.join(app.getAppPath(), 'resources')
}

function expandPathToken(input: string, token: string, replacement: string): string {
  const normalizedInput = input.replace(/\\/g, '/')
  if (normalizedInput === token) return replacement

  const prefix = `${token}/`
  if (!normalizedInput.startsWith(prefix)) return input

  const suffix = normalizedInput.slice(prefix.length)
  const segments = suffix.length > 0 ? suffix.split('/').filter(Boolean) : []
  return path.join(replacement, ...segments)
}

function resolveConfigPath(rawPath: string): string {
  const trimmed = rawPath.trim()
  if (!trimmed) return ''

  const userDataPath = app.getPath('userData')
  const resourcesPath = getResourcesRoot()

  let expanded = trimmed
  expanded = expandPathToken(expanded, '$USER_DATA', userDataPath)
  expanded = expandPathToken(expanded, '$APP', app.getAppPath())
  expanded = expandPathToken(expanded, '$RESOURCES', resourcesPath)

  return path.isAbsolute(expanded)
    ? path.normalize(expanded)
    : path.normalize(path.join(userDataPath, expanded))
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

    const loaded = loadEditableJsonConfig<AppConfigFile>({
      configName: 'app-config',
      bundledDefault: bundledAppConfig as AppConfigFile,
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

    writeJsonFile(this.getRuntimeConfigPath(), next)

    return this.loadResolvedPaths()
  }
}
