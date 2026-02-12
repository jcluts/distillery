import Database from 'better-sqlite3'
import type { MediaRecord, MediaUpdate, MediaQuery, MediaPage } from '../../types'

/**
 * Query media with filtering, sorting, and pagination.
 */
export function queryMedia(db: Database.Database, params: MediaQuery): MediaPage {
  const page = params.page ?? 1
  const pageSize = params.pageSize ?? 200
  const offset = (page - 1) * pageSize

  const conditions: string[] = []
  const values: unknown[] = []

  if (params.media_type) {
    conditions.push('media_type = ?')
    values.push(params.media_type)
  }

  if (params.rating !== undefined && params.rating > 0) {
    conditions.push('rating >= ?')
    values.push(params.rating)
  }

  if (params.status === 'selected' || params.status === 'rejected') {
    conditions.push('status = ?')
    values.push(params.status)
  } else if (params.status === 'unmarked') {
    conditions.push('status IS NULL')
  }
  // 'all' and undefined = no filter

  if (params.search) {
    conditions.push('(file_name LIKE ? OR keywords LIKE ?)')
    const like = `%${params.search}%`
    values.push(like, like)
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

  // Count
  const countRow = db
    .prepare(`SELECT COUNT(*) as total FROM media ${where}`)
    .get(...values) as { total: number }

  // Sort
  const sortField = params.sort ?? 'created_at'
  const sortDir = params.sortDirection ?? 'desc'
  const orderBy = `ORDER BY ${sortField} ${sortDir}`

  // Fetch
  const items = db
    .prepare(`SELECT * FROM media ${where} ${orderBy} LIMIT ? OFFSET ?`)
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
 * Insert a new media record.
 */
export function insertMedia(db: Database.Database, media: MediaRecord): void {
  db.prepare(
    `INSERT INTO media (
      id, file_path, thumb_path, file_name, media_type, origin,
      width, height, file_size, rating, status, keywords,
      generation_id, origin_id, created_at, updated_at
    ) VALUES (
      @id, @file_path, @thumb_path, @file_name, @media_type, @origin,
      @width, @height, @file_size, @rating, @status, @keywords,
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
  if (updates.keywords !== undefined) {
    sets.push('keywords = ?')
    values.push(updates.keywords)
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
