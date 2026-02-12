import Database from 'better-sqlite3'
import type { BaseModel } from '../../types'

/**
 * Get all base models.
 */
export function getAllModels(db: Database.Database): BaseModel[] {
  return db.prepare('SELECT * FROM base_models ORDER BY name').all() as BaseModel[]
}

/**
 * Get a model by ID.
 */
export function getModelById(
  db: Database.Database,
  id: string
): BaseModel | null {
  return (
    (db.prepare('SELECT * FROM base_models WHERE id = ?').get(id) as BaseModel) ?? null
  )
}

/**
 * Get a model by name.
 */
export function getModelByName(
  db: Database.Database,
  name: string
): BaseModel | null {
  return (
    (db
      .prepare('SELECT * FROM base_models WHERE name = ?')
      .get(name) as BaseModel) ?? null
  )
}
