import Database from 'better-sqlite3'
import type {
  ImageAdjustments,
  ImageTransforms,
  MediaRecord,
  MediaUpdate,
  MediaQuery,
  MediaPage,
  RemovalData
} from '../../types'

interface TransformsRow {
  transforms_json: string | null
}

interface AdjustmentsRow {
  adjustments_json: string | null
}

interface RemovalsRow {
  removals_json: string | null
}

function isDefaultAdjustments(adjustments: ImageAdjustments): boolean {
  return (
    adjustments.exposure === 0 &&
    adjustments.brightness === 1 &&
    adjustments.contrast === 1 &&
    adjustments.highlights === 0 &&
    adjustments.shadows === 0 &&
    adjustments.saturation === 1 &&
    adjustments.vibrance === 0 &&
    adjustments.temperature === 0 &&
    adjustments.tint === 0 &&
    adjustments.hue === 0 &&
    adjustments.clarity === 0
  )
}

/**
 * Query media with filtering, sorting, and pagination.
 */
export function queryMedia(db: Database.Database, params: MediaQuery): MediaPage {
  const page = params.page ?? 1
  const pageSize = params.pageSize ?? 200
  const offset = (page - 1) * pageSize

  let fromClause = 'media'
  const conditions: string[] = []
  const values: unknown[] = []

  if (params.collectionId && params.collectionId !== 'special-all') {
    if (params.collectionId === 'special-generated') {
      conditions.push("media.origin = 'generation'")
    } else if (params.collectionId === 'special-imported') {
      conditions.push("media.origin = 'import'")
    } else {
      fromClause = 'media JOIN collection_media cm ON cm.media_id = media.id'
      conditions.push('cm.collection_id = ?')
      values.push(params.collectionId)
    }
  }

  if (params.media_type) {
    conditions.push('media.media_type = ?')
    values.push(params.media_type)
  }

  if (params.rating !== undefined && params.rating > 0) {
    conditions.push('media.rating >= ?')
    values.push(params.rating)
  }

  if (params.status === 'selected' || params.status === 'rejected') {
    conditions.push('media.status = ?')
    values.push(params.status)
  } else if (params.status === 'unmarked') {
    conditions.push('media.status IS NULL')
  }
  // 'all' and undefined = no filter

  if (params.search) {
    conditions.push(
      `(media.file_name LIKE ? OR media.id IN (
        SELECT mk.media_id FROM media_keywords mk
        JOIN keywords k ON k.id = mk.keyword_id
        WHERE k.keyword LIKE ?
      ))`
    )
    const like = `%${params.search}%`
    values.push(like, like)
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

  // Count
  const countRow = db
    .prepare(`SELECT COUNT(DISTINCT media.id) as total FROM ${fromClause} ${where}`)
    .get(...values) as { total: number }

  // Sort
  const allowedSortFields = new Set(['created_at', 'rating', 'file_name'] as const)
  const sortField =
    params.sort && allowedSortFields.has(params.sort)
      ? params.sort
      : 'created_at'
  const sortDir = params.sortDirection === 'asc' ? 'asc' : 'desc'
  const orderBy = `ORDER BY media.${sortField} ${sortDir}`

  // Fetch
  const items = db
    .prepare(`SELECT media.* FROM ${fromClause} ${where} ${orderBy} LIMIT ? OFFSET ?`)
    .all(...values, pageSize, offset) as MediaRecord[]

  return {
    items,
    total: countRow.total,
    page,
    pageSize
  }
}

/**
 * Get a single media record by ID.
 */
export function getMediaById(
  db: Database.Database,
  id: string
): MediaRecord | null {
  return (db.prepare('SELECT * FROM media WHERE id = ?').get(id) as MediaRecord) ?? null
}

/**
 * Get a single media record by stored file path.
 */
export function getMediaByFilePath(
  db: Database.Database,
  filePath: string
): MediaRecord | null {
  return (
    (db.prepare('SELECT * FROM media WHERE file_path = ?').get(filePath) as MediaRecord | undefined) ??
    null
  )
}

/**
 * Get the most recent output media record for a generation.
 *
 * MVP assumes a generation produces at least one output media item.
 */
export function getMediaByGenerationId(
  db: Database.Database,
  generationId: string
): MediaRecord | null {
  return (
    (db
      .prepare('SELECT * FROM media WHERE generation_id = ? ORDER BY created_at DESC LIMIT 1')
      .get(generationId) as MediaRecord) ?? null
  )
}

/**
 * Insert a new media record.
 */
export function insertMedia(db: Database.Database, media: MediaRecord): void {
  db.prepare(
    `INSERT INTO media (
      id, file_path, thumb_path, file_name, media_type, origin,
      width, height, duration, file_size, rating, status,
      generation_id, origin_id, created_at, updated_at
    ) VALUES (
      @id, @file_path, @thumb_path, @file_name, @media_type, @origin,
      @width, @height, @duration, @file_size, @rating, @status,
      @generation_id, @origin_id, @created_at, @updated_at
    )`
  ).run(media)
}

/**
 * Update a media record.
 */
export function updateMedia(
  db: Database.Database,
  id: string,
  updates: MediaUpdate
): void {
  const sets: string[] = []
  const values: unknown[] = []

  if (updates.rating !== undefined) {
    sets.push('rating = ?')
    values.push(updates.rating)
  }
  if (updates.status !== undefined) {
    sets.push('status = ?')
    values.push(updates.status)
  }
  if (updates.file_name !== undefined) {
    sets.push('file_name = ?')
    values.push(updates.file_name)
  }

  if (sets.length === 0) return

  sets.push("updated_at = datetime('now')")
  values.push(id)

  db.prepare(`UPDATE media SET ${sets.join(', ')} WHERE id = ?`).run(...values)
}

/**
 * Delete media records by IDs.
 */
export function deleteMedia(db: Database.Database, ids: string[]): void {
  const placeholders = ids.map(() => '?').join(', ')
  db.prepare(`DELETE FROM media WHERE id IN (${placeholders})`).run(...ids)
}

/**
 * Fetch persisted transforms for a media item.
 */
export function getTransforms(
  db: Database.Database,
  mediaId: string
): ImageTransforms | null {
  const row = db
    .prepare('SELECT transforms_json FROM media WHERE id = ?')
    .get(mediaId) as TransformsRow | undefined

  if (!row?.transforms_json) {
    return null
  }

  try {
    return JSON.parse(row.transforms_json) as ImageTransforms
  } catch {
    return null
  }
}

/**
 * Persist transforms for a media item.
 */
export function saveTransforms(
  db: Database.Database,
  mediaId: string,
  transforms: ImageTransforms | null
): void {
  db.prepare(
    "UPDATE media SET transforms_json = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?"
  ).run(transforms ? JSON.stringify(transforms) : null, mediaId)
}

/**
 * Fetch persisted adjustments for a media item.
 */
export function getAdjustments(
  db: Database.Database,
  mediaId: string
): ImageAdjustments | null {
  const row = db
    .prepare('SELECT adjustments_json FROM media WHERE id = ?')
    .get(mediaId) as AdjustmentsRow | undefined

  if (!row?.adjustments_json) {
    return null
  }

  try {
    return JSON.parse(row.adjustments_json) as ImageAdjustments
  } catch {
    return null
  }
}

/**
 * Persist adjustments for a media item.
 */
export function saveAdjustments(
  db: Database.Database,
  mediaId: string,
  adjustments: ImageAdjustments | null
): void {
  const normalized = adjustments && isDefaultAdjustments(adjustments) ? null : adjustments

  db.prepare(
    "UPDATE media SET adjustments_json = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?"
  ).run(normalized ? JSON.stringify(normalized) : null, mediaId)
}

/**
 * Fetch persisted removals data for a media item.
 */
export function getRemovals(
  db: Database.Database,
  mediaId: string
): RemovalData | null {
  const row = db
    .prepare('SELECT removals_json FROM media WHERE id = ?')
    .get(mediaId) as RemovalsRow | undefined

  if (!row?.removals_json) {
    return null
  }

  try {
    return JSON.parse(row.removals_json) as RemovalData
  } catch {
    return null
  }
}

/**
 * Persist removals data for a media item.
 */
export function saveRemovals(
  db: Database.Database,
  mediaId: string,
  data: RemovalData | null
): void {
  db.prepare(
    "UPDATE media SET removals_json = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?"
  ).run(data ? JSON.stringify(data) : null, mediaId)
}
