import Database from 'better-sqlite3'
import os from 'os'
import path from 'path'
import { app } from 'electron'
import type { AppSettings, SettingsKey } from '../../types'

const DEFAULT_LIBRARY_ROOT = path.join(os.homedir(), 'Distillery', 'Library')
const DEFAULT_ACTIVE_MODEL_ID = 'flux2-klein-4b'

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
  try {
    return path.join(app.getPath('userData'), 'models')
  } catch {
    return path.join(os.homedir(), 'Distillery', 'models')
  }
}

function getDefaults(): AppSettings {
  return {
    library_root: DEFAULT_LIBRARY_ROOT,
    engine_path: '',
    model_base_path: getDefaultModelBasePath(),
    active_model_id: DEFAULT_ACTIVE_MODEL_ID,
    model_quant_selections: JSON.parse(JSON.stringify(DEFAULT_MODEL_QUANT_SELECTIONS)),
    offload_to_cpu: true,
    flash_attn: true,
    vae_on_cpu: false,
    llm_on_cpu: false,
    left_panel_open: true,
    left_panel_tab: 'generation',
    left_panel_width: 320,
    right_panel_open: true,
    right_panel_tab: 'info',
    right_panel_width: 280,
    thumbnail_size: 200,
    view_mode: 'grid'
  }
}

function normalizeSettings(settings: AppSettings, defaults: AppSettings): AppSettings {
  return {
    ...settings,
    model_base_path:
      typeof settings.model_base_path === 'string' && settings.model_base_path.trim()
        ? settings.model_base_path
        : defaults.model_base_path,
    active_model_id:
      typeof settings.active_model_id === 'string' && settings.active_model_id.trim()
        ? settings.active_model_id
        : defaults.active_model_id,
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
  db.prepare(
    `INSERT INTO app_settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  ).run(key, JSON.stringify(value))
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
