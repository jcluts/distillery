import Database from 'better-sqlite3'
import os from 'os'
import path from 'path'
import type { AppSettings, SettingsKey } from '../../types'

const DEFAULT_LIBRARY_ROOT = path.join(os.homedir(), 'Distillery', 'Library')

// Default settings values
const DEFAULTS: AppSettings = {
  library_root: DEFAULT_LIBRARY_ROOT,
  engine_path: '',
  diffusion_model_path: '',
  vae_path: '',
  llm_path: '',
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

/**
 * Get a single setting value.
 */
export function getSetting<K extends SettingsKey>(
  db: Database.Database,
  key: K
): AppSettings[K] {
  const row = db
    .prepare('SELECT value FROM app_settings WHERE key = ?')
    .get(key) as { value: string } | undefined

  if (!row) return DEFAULTS[key]

  try {
    return JSON.parse(row.value) as AppSettings[K]
  } catch {
    return DEFAULTS[key]
  }
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
  const rows = db.prepare('SELECT key, value FROM app_settings').all() as {
    key: string
    value: string
  }[]

  const settings = { ...DEFAULTS }

  for (const row of rows) {
    try {
      ;(settings as Record<string, unknown>)[row.key] = JSON.parse(row.value)
    } catch {
      // Skip invalid JSON
    }
  }

  return settings
}

/**
 * Save multiple settings at once.
 */
export function saveSettings(
  db: Database.Database,
  updates: Partial<AppSettings>
): void {
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
