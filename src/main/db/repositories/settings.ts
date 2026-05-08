import Database from 'better-sqlite3'
import { app } from 'electron'
import os from 'os'
import path from 'path'
import type { AppSettings, SettingsKey } from '../../types'

const DEFAULT_LIBRARY_ROOT = path.join(os.homedir(), 'Distillery', 'Library')
const DEFAULT_ACTIVE_MODEL_ID = 'flux2-klein-4b'
const ENABLE_CN_ENGINE = process.env.DISTILLERY_ENABLE_CN_ENGINE === '1'

const DEFAULT_MODEL_QUANT_SELECTIONS = {
  'flux2-klein-4b': {
    diffusionQuant: '',
    textEncoderQuant: ''
  },
  'flux2-klein-9b': {
    diffusionQuant: '',
    textEncoderQuant: ''
  }
}

function getDefaultModelBasePath(): string {
  return path.join(app.getPath('userData'), 'models')
}

function getDefaultEnginePath(): string {
  const resourcesRoot = app.isPackaged
    ? process.resourcesPath
    : path.join(app.getAppPath(), 'resources')
  const engineDir = path.join(resourcesRoot, 'cn-engine', 'win32', 'vulkan')
  const exeName = process.platform === 'win32' ? 'cn-engine.exe' : 'cn-engine'
  return path.join(engineDir, exeName)
}

function getDefaultSdCppServerPath(): string {
  const resourcesRoot = app.isPackaged
    ? process.resourcesPath
    : path.join(app.getAppPath(), 'resources')

  const platformDir =
    process.platform === 'darwin' ? 'mac' : process.platform === 'win32' ? 'win' : process.platform
  const exeName = process.platform === 'win32' ? 'sd-server.exe' : 'sd-server'
  return path.join(resourcesRoot, 'sd-cpp', platformDir, exeName)
}

function getDefaults(): AppSettings {
  return {
    library_root: DEFAULT_LIBRARY_ROOT,
    engine_path: getDefaultEnginePath(),
    sd_cpp_server_path: getDefaultSdCppServerPath(),
    model_base_path: getDefaultModelBasePath(),
    upscale_backend: 'auto',
    local_generation_backend: 'stable-diffusion.cpp',
    active_model_id: DEFAULT_ACTIVE_MODEL_ID,
    model_quant_selections: JSON.parse(JSON.stringify(DEFAULT_MODEL_QUANT_SELECTIONS)),
    offload_to_cpu: true,
    flash_attn: true,
    vae_on_cpu: false,
    llm_on_cpu: false,
    confirm_before_delete: true,
    left_panel_open: true,
    left_panel_tab: 'generation',
    left_panel_width: 320,
    right_panel_open: true,
    right_panel_tab: 'info',
    right_panel_width: 280,
    thumbnail_size: 200,
    view_mode: 'grid',
    fal_api_key: '',
    replicate_api_key: '',
    wavespeed_api_key: '',
    gptproto_api_key: '',
    kie_api_key: ''
  }
}

function normalizeUpscaleBackend(
  value: AppSettings['upscale_backend'],
  fallback: AppSettings['upscale_backend']
): AppSettings['upscale_backend'] {
  if (value === 'cn-engine' && !ENABLE_CN_ENGINE) return fallback
  return value === 'onnx' || value === 'cn-engine' || value === 'auto' ? value : fallback
}

function normalizeLocalGenerationBackend(
  value: AppSettings['local_generation_backend'],
  fallback: AppSettings['local_generation_backend']
): AppSettings['local_generation_backend'] {
  if (value === 'cn-engine' && !ENABLE_CN_ENGINE) return fallback
  return value === 'cn-engine' || value === 'stable-diffusion.cpp' ? value : fallback
}

function normalizeSettings(settings: AppSettings, defaults: AppSettings): AppSettings {
  return {
    ...settings,
    engine_path:
      typeof settings.engine_path === 'string' && settings.engine_path.trim()
        ? settings.engine_path
        : defaults.engine_path,
    sd_cpp_server_path:
      typeof settings.sd_cpp_server_path === 'string' && settings.sd_cpp_server_path.trim()
        ? settings.sd_cpp_server_path
        : defaults.sd_cpp_server_path,
    model_base_path:
      typeof settings.model_base_path === 'string' && settings.model_base_path.trim()
        ? settings.model_base_path
        : defaults.model_base_path,
    active_model_id:
      typeof settings.active_model_id === 'string' && settings.active_model_id.trim()
        ? settings.active_model_id
        : defaults.active_model_id,
    upscale_backend: normalizeUpscaleBackend(settings.upscale_backend, defaults.upscale_backend),
    local_generation_backend: normalizeLocalGenerationBackend(
      settings.local_generation_backend,
      defaults.local_generation_backend
    ),
    model_quant_selections:
      settings.model_quant_selections && typeof settings.model_quant_selections === 'object'
        ? settings.model_quant_selections
        : defaults.model_quant_selections
  }
}

/**
 * Get a single setting value.
 */
export function getSetting<K extends SettingsKey>(db: Database.Database, key: K): AppSettings[K] {
  const all = getAllSettings(db)
  return all[key]
}

/**
 * Set a single setting value.
 */
export function setSetting<K extends SettingsKey>(
  db: Database.Database,
  key: K,
  value: AppSettings[K]
): void {
  saveSettings(db, { [key]: value } as Partial<AppSettings>)
}

/**
 * Get all settings, filling in defaults for missing keys.
 */
export function getAllSettings(db: Database.Database): AppSettings {
  const defaults = getDefaults()
  const rows = db.prepare('SELECT key, value FROM app_settings').all() as {
    key: string
    value: string
  }[]

  const settings = { ...defaults }

  for (const row of rows) {
    try {
      ;(settings as Record<string, unknown>)[row.key] = JSON.parse(row.value)
    } catch {
      // Skip invalid JSON
    }
  }

  return normalizeSettings(settings, defaults)
}

/**
 * Save multiple settings at once.
 */
export function saveSettings(db: Database.Database, updates: Partial<AppSettings>): void {
  const stmt = db.prepare(
    `INSERT INTO app_settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  )

  const transaction = db.transaction(() => {
    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined) {
        stmt.run(key, JSON.stringify(value))
      }
    }
  })

  transaction()
}
