import Database from 'better-sqlite3'
import { v4 as uuidv4 } from 'uuid'

import type { CollectionCreate, CollectionRecord, CollectionUpdate } from '../../types'

function getCollectionOrThrow(db: Database.Database, id: string): CollectionRecord {
  const row = getCollectionById(db, id)
  if (!row) {
    throw new Error(`Collection not found: ${id}`)
  }
  return row
}

function ensureEditableCollection(collection: CollectionRecord): void {
  if (collection.type === 'special') {
    throw new Error('Special collections cannot be modified')
  }
}

export function getAllCollections(db: Database.Database): CollectionRecord[] {
  return db
    .prepare(
      `SELECT
        c.id,
        c.name,
        c.color,
        c.type,
        c.system_key,
        c.sort_order,
        c.filter_json,
        c.created_at,
        c.updated_at,
        CASE
          WHEN c.system_key = 'all' THEN (SELECT COUNT(*) FROM media)
          WHEN c.system_key = 'generated' THEN (SELECT COUNT(*) FROM media WHERE origin = 'generation')
          WHEN c.system_key = 'imported' THEN (SELECT COUNT(*) FROM media WHERE origin = 'import')
          ELSE (
            SELECT COUNT(*)
            FROM collection_media cm
            WHERE cm.collection_id = c.id
          )
        END AS media_count
      FROM collections c
      ORDER BY c.sort_order ASC, c.created_at ASC`
    )
    .all() as CollectionRecord[]
}

export function getCollectionById(db: Database.Database, id: string): CollectionRecord | null {
  return (
    (db
      .prepare(
        `SELECT
          c.id,
          c.name,
          c.color,
          c.type,
          c.system_key,
          c.sort_order,
          c.filter_json,
          c.created_at,
          c.updated_at,
          CASE
            WHEN c.system_key = 'all' THEN (SELECT COUNT(*) FROM media)
            WHEN c.system_key = 'generated' THEN (SELECT COUNT(*) FROM media WHERE origin = 'generation')
            WHEN c.system_key = 'imported' THEN (SELECT COUNT(*) FROM media WHERE origin = 'import')
            ELSE (
              SELECT COUNT(*)
              FROM collection_media cm
              WHERE cm.collection_id = c.id
            )
          END AS media_count
        FROM collections c
        WHERE c.id = ?`
      )
      .get(id) as CollectionRecord | undefined) ?? null
  )
}

export function createCollection(
  db: Database.Database,
  data: CollectionCreate
): CollectionRecord {
  const id = uuidv4()
  const name = data.name.trim()
  const color = data.color?.trim() || 'var(--foreground)'

  if (!name) {
    throw new Error('Collection name is required')
  }

  const nextSortOrderRow = db
    .prepare('SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM collections')
    .get() as { next: number }

  db.transaction(() => {
    db.prepare(
      `INSERT INTO collections (
        id, name, color, type, system_key, sort_order, filter_json, created_at, updated_at
      ) VALUES (?, ?, ?, 'manual', NULL, ?, NULL, datetime('now'), datetime('now'))`
    ).run(id, name, color, nextSortOrderRow.next)

    const mediaIds = [...new Set(data.media_ids ?? [])]
    if (mediaIds.length === 0) return

    const insertJunction = db.prepare(
      `INSERT OR IGNORE INTO collection_media (
        collection_id, media_id, sort_order, added_at
      ) VALUES (?, ?, ?, datetime('now'))`
    )

    for (const [index, mediaId] of mediaIds.entries()) {
      insertJunction.run(id, mediaId, index)
    }
  })()

  const created = getCollectionById(db, id)
  if (!created) {
    throw new Error('Failed to create collection')
  }

  return created
}

export function updateCollection(
  db: Database.Database,
  id: string,
  data: CollectionUpdate
): void {
  const collection = getCollectionOrThrow(db, id)
  ensureEditableCollection(collection)

  const sets: string[] = []
  const values: unknown[] = []

  if (data.name !== undefined) {
    const nextName = data.name.trim()
    if (!nextName) {
      throw new Error('Collection name is required')
    }
    sets.push('name = ?')
    values.push(nextName)
  }

  if (data.color !== undefined) {
    sets.push('color = ?')
    values.push(data.color.trim())
  }

  if (sets.length === 0) return

  sets.push("updated_at = datetime('now')")
  values.push(id)

  db.prepare(`UPDATE collections SET ${sets.join(', ')} WHERE id = ?`).run(...values)
}

export function deleteCollection(db: Database.Database, id: string): void {
  const collection = getCollectionOrThrow(db, id)
  ensureEditableCollection(collection)
  db.prepare('DELETE FROM collections WHERE id = ?').run(id)
}

export function reorderCollections(db: Database.Database, orderedIds: string[]): void {
  const uniqueOrderedIds = [...new Set(orderedIds)]
  if (uniqueOrderedIds.length === 0) return

  const specialMaxRow = db
    .prepare(
      "SELECT COALESCE(MAX(sort_order), -1) AS max_sort FROM collections WHERE type = 'special'"
    )
    .get() as { max_sort: number }

  const specialBase = specialMaxRow.max_sort + 1

  db.transaction(() => {
    const updateStmt = db.prepare(
      `UPDATE collections
       SET sort_order = ?, updated_at = datetime('now')
       WHERE id = ? AND type <> 'special'`
    )

    for (const [index, id] of uniqueOrderedIds.entries()) {
      updateStmt.run(specialBase + index, id)
    }
  })()
}

export function addMediaToCollection(
  db: Database.Database,
  collectionId: string,
  mediaIds: string[]
): void {
  const collection = getCollectionOrThrow(db, collectionId)
  ensureEditableCollection(collection)

  const uniqueMediaIds = [...new Set(mediaIds)]
  if (uniqueMediaIds.length === 0) return

  db.transaction(() => {
    const maxRow = db
      .prepare('SELECT COALESCE(MAX(sort_order), -1) AS max_order FROM collection_media WHERE collection_id = ?')
      .get(collectionId) as { max_order: number }

    const existingRows = db
      .prepare(
        `SELECT media_id
         FROM collection_media
         WHERE collection_id = ?
           AND media_id IN (${uniqueMediaIds.map(() => '?').join(', ')})`
      )
      .all(collectionId, ...uniqueMediaIds) as { media_id: string }[]

    const existing = new Set(existingRows.map((row) => row.media_id))
    const toInsert = uniqueMediaIds.filter((mediaId) => !existing.has(mediaId))

    if (toInsert.length === 0) return

    const insertStmt = db.prepare(
      `INSERT INTO collection_media (
        collection_id, media_id, sort_order, added_at
      ) VALUES (?, ?, ?, datetime('now'))`
    )

    for (const [index, mediaId] of toInsert.entries()) {
      insertStmt.run(collectionId, mediaId, maxRow.max_order + index + 1)
    }
  })()
}

export function removeMediaFromCollection(
  db: Database.Database,
  collectionId: string,
  mediaIds: string[]
): void {
  const collection = getCollectionOrThrow(db, collectionId)
  ensureEditableCollection(collection)

  const uniqueMediaIds = [...new Set(mediaIds)]
  if (uniqueMediaIds.length === 0) return

  db.prepare(
    `DELETE FROM collection_media
     WHERE collection_id = ?
       AND media_id IN (${uniqueMediaIds.map(() => '?').join(', ')})`
  ).run(collectionId, ...uniqueMediaIds)
}

export function getMediaIdsInCollection(db: Database.Database, collectionId: string): string[] {
  const collection = getCollectionOrThrow(db, collectionId)
  if (collection.type !== 'manual') return []

  const rows = db
    .prepare(
      `SELECT media_id
       FROM collection_media
       WHERE collection_id = ?
       ORDER BY sort_order ASC, added_at ASC`
    )
    .all(collectionId) as { media_id: string }[]

  return rows.map((row) => row.media_id)
}
