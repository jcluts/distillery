import Database from 'better-sqlite3'
import { v4 as uuidv4 } from 'uuid'

import type { ImportFolderCreate, ImportFolderRecord, ImportFolderUpdate } from '../../types'

interface ImportFolderRow {
  id: string
  name: string
  path: string
  import_mode: 'reference' | 'copy' | 'move'
  recursive: number
  persist: number
  auto_import: number
  target_collection_id: string | null
  initial_keywords: string | null
  last_scanned: string | null
  created_at: string
}

function parseKeywords(raw: string | null): string[] | undefined {
  if (!raw) return undefined

  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return undefined
    const normalized = parsed.filter((value): value is string => typeof value === 'string')
    return normalized.length > 0 ? normalized : undefined
  } catch {
    return undefined
  }
}

function mapImportFolderRow(row: ImportFolderRow): ImportFolderRecord {
  return {
    id: row.id,
    name: row.name,
    path: row.path,
    import_mode: row.import_mode,
    recursive: row.recursive === 1,
    persist: row.persist === 1,
    auto_import: row.auto_import === 1,
    target_collection_id: row.target_collection_id ?? undefined,
    initial_keywords: parseKeywords(row.initial_keywords),
    last_scanned: row.last_scanned ?? undefined,
    created_at: row.created_at
  }
}

export function getAllImportFolders(db: Database.Database): ImportFolderRecord[] {
  const rows = db
    .prepare(
      `SELECT id, name, path, import_mode, recursive, persist, auto_import,
              target_collection_id, initial_keywords, last_scanned, created_at
       FROM import_folders
       WHERE persist = 1
       ORDER BY created_at DESC`
    )
    .all() as ImportFolderRow[]

  return rows.map(mapImportFolderRow)
}

export function getImportFolderById(
  db: Database.Database,
  id: string
): ImportFolderRecord | undefined {
  const row = db
    .prepare(
      `SELECT id, name, path, import_mode, recursive, persist, auto_import,
              target_collection_id, initial_keywords, last_scanned, created_at
       FROM import_folders
       WHERE id = ?`
    )
    .get(id) as ImportFolderRow | undefined

  return row ? mapImportFolderRow(row) : undefined
}

export function createImportFolder(
  db: Database.Database,
  data: ImportFolderCreate
): ImportFolderRecord {
  const id = uuidv4()
  const name = data.name.trim()
  const folderPath = data.path.trim()

  if (!name) {
    throw new Error('Import folder name is required')
  }

  if (!folderPath) {
    throw new Error('Import folder path is required')
  }

  const normalizedKeywords =
    data.initial_keywords?.map((keyword) => keyword.trim().toLowerCase()).filter(Boolean) ?? []

  db.prepare(
    `INSERT INTO import_folders (
      id, name, path, import_mode, recursive, persist, auto_import,
      target_collection_id, initial_keywords, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
  ).run(
    id,
    name,
    folderPath,
    data.import_mode,
    data.recursive ? 1 : 0,
    data.persist ? 1 : 0,
    data.auto_import ? 1 : 0,
    data.target_collection_id ?? null,
    normalizedKeywords.length > 0 ? JSON.stringify(normalizedKeywords) : null
  )

  const created = getImportFolderById(db, id)
  if (!created) {
    throw new Error('Failed to create import folder')
  }

  return created
}

export function updateImportFolder(
  db: Database.Database,
  data: ImportFolderUpdate
): ImportFolderRecord | undefined {
  const sets: string[] = []
  const values: unknown[] = []

  if (data.name !== undefined) {
    const name = data.name.trim()
    if (!name) {
      throw new Error('Import folder name is required')
    }
    sets.push('name = ?')
    values.push(name)
  }

  if (data.import_mode !== undefined) {
    sets.push('import_mode = ?')
    values.push(data.import_mode)
  }

  if (data.recursive !== undefined) {
    sets.push('recursive = ?')
    values.push(data.recursive ? 1 : 0)
  }

  if (data.persist !== undefined) {
    sets.push('persist = ?')
    values.push(data.persist ? 1 : 0)
  }

  if (data.auto_import !== undefined) {
    sets.push('auto_import = ?')
    values.push(data.auto_import ? 1 : 0)
  }

  if (data.target_collection_id !== undefined) {
    sets.push('target_collection_id = ?')
    values.push(data.target_collection_id ?? null)
  }

  if (data.initial_keywords !== undefined) {
    const normalizedKeywords = data.initial_keywords
      .map((keyword) => keyword.trim().toLowerCase())
      .filter(Boolean)

    sets.push('initial_keywords = ?')
    values.push(normalizedKeywords.length > 0 ? JSON.stringify(normalizedKeywords) : null)
  }

  if (sets.length === 0) {
    return getImportFolderById(db, data.id)
  }

  values.push(data.id)

  db.prepare(`UPDATE import_folders SET ${sets.join(', ')} WHERE id = ?`).run(...values)
  return getImportFolderById(db, data.id)
}

export function deleteImportFolder(db: Database.Database, id: string): void {
  db.prepare('DELETE FROM import_folders WHERE id = ?').run(id)
}

export function updateLastScanned(db: Database.Database, id: string): void {
  db.prepare("UPDATE import_folders SET last_scanned = datetime('now') WHERE id = ?").run(id)
}
