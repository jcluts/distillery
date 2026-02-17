import * as fs from 'fs'
import * as path from 'path'
import { app } from 'electron'

export type ConfigSourceMode = 'bundled-dev' | 'runtime-profile'

export function getConfigSourceMode(): ConfigSourceMode {
  return app.isPackaged ? 'runtime-profile' : 'bundled-dev'
}

export function shouldUseProfileConfigFiles(): boolean {
  return getConfigSourceMode() === 'runtime-profile'
}

export function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

export function ensureDirectoryForFile(filePath: string): void {
  const dirPath = path.dirname(filePath)
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true })
  }
}

export function writeJsonFile(filePath: string, value: unknown): void {
  ensureDirectoryForFile(filePath)
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), 'utf8')
}

export function loadEditableJsonConfig<T>(options: {
  configName: string
  bundledDefault: T
  runtimePath: string
  isValid: (value: unknown) => value is T
}): T {
  const { configName, bundledDefault, runtimePath, isValid } = options

  if (!shouldUseProfileConfigFiles()) {
    return cloneJson(bundledDefault)
  }

  if (!fs.existsSync(runtimePath)) {
    writeJsonFile(runtimePath, bundledDefault)
    return cloneJson(bundledDefault)
  }

  try {
    const raw = fs.readFileSync(runtimePath, 'utf8')
    const parsed = JSON.parse(raw) as unknown
    if (!isValid(parsed)) {
      throw new Error('Invalid config shape')
    }

    return parsed
  } catch (error) {
    console.warn(
      `[Config] Failed to read ${configName} at ${runtimePath}, re-seeding from bundled defaults:`,
      error
    )
    writeJsonFile(runtimePath, bundledDefault)
    return cloneJson(bundledDefault)
  }
}

export function seedRuntimeJsonDirectory(
  defaultFiles: Record<string, unknown>,
  dirPath: string
): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true })
  }

  for (const [fileName, value] of Object.entries(defaultFiles)) {
    const targetPath = path.join(dirPath, fileName)
    if (fs.existsSync(targetPath)) continue
    writeJsonFile(targetPath, value)
  }
}

export function readJsonConfigsFromDirectory<T>(options: {
  dirPath: string
  configName: string
  isValid: (value: unknown) => value is T
}): T[] {
  const { dirPath, configName, isValid } = options
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true })
    return []
  }

  const files = fs.readdirSync(dirPath).filter((name) => name.endsWith('.json'))
  const results: T[] = []

  for (const file of files) {
    const absPath = path.join(dirPath, file)
    try {
      const parsed = JSON.parse(fs.readFileSync(absPath, 'utf8')) as unknown
      if (isValid(parsed)) {
        results.push(parsed)
      } else {
        console.warn(`[Config] Skipping invalid ${configName} file at ${absPath}`)
      }
    } catch (error) {
      console.warn(`[Config] Failed reading ${configName} file at ${absPath}:`, error)
    }
  }

  return results
}
