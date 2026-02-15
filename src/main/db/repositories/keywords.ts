import Database from 'better-sqlite3'

// =============================================================================
// Keywords Repository
// Normalized keyword management via keywords + media_keywords junction tables.
// =============================================================================

/**
 * Get all keywords for a media item, sorted alphabetically.
 */
export function getKeywordsForMedia(db: Database.Database, mediaId: string): string[] {
  const rows = db
    .prepare(
      `SELECT k.keyword FROM keywords k
       JOIN media_keywords mk ON mk.keyword_id = k.id
       WHERE mk.media_id = ?
       ORDER BY k.keyword`
    )
    .all(mediaId) as { keyword: string }[]
  return rows.map((r) => r.keyword)
}

/**
 * Set the complete keyword list for a media item (replaces all existing).
 */
export function setKeywordsForMedia(
  db: Database.Database,
  mediaId: string,
  keywords: string[]
): void {
  const normalized = [
    ...new Set(keywords.map((k) => k.trim().toLowerCase()).filter(Boolean))
  ]

  const run = db.transaction(() => {
    // Remove all existing associations
    db.prepare('DELETE FROM media_keywords WHERE media_id = ?').run(mediaId)

    if (normalized.length === 0) return

    const insertKw = db.prepare('INSERT OR IGNORE INTO keywords (keyword) VALUES (?)')
    const getKwId = db.prepare('SELECT id FROM keywords WHERE keyword = ?')
    const insertJunction = db.prepare(
      'INSERT OR IGNORE INTO media_keywords (media_id, keyword_id) VALUES (?, ?)'
    )

    for (const kw of normalized) {
      insertKw.run(kw)
      const row = getKwId.get(kw) as { id: number }
      insertJunction.run(mediaId, row.id)
    }
  })

  run()
}

/**
 * Add a single keyword to a media item.
 */
export function addKeywordToMedia(
  db: Database.Database,
  mediaId: string,
  keyword: string
): void {
  const normalized = keyword.trim().toLowerCase()
  if (!normalized) return

  db.prepare('INSERT OR IGNORE INTO keywords (keyword) VALUES (?)').run(normalized)
  const row = db.prepare('SELECT id FROM keywords WHERE keyword = ?').get(normalized) as {
    id: number
  }
  db.prepare(
    'INSERT OR IGNORE INTO media_keywords (media_id, keyword_id) VALUES (?, ?)'
  ).run(mediaId, row.id)
}

/**
 * Remove a single keyword from a media item.
 */
export function removeKeywordFromMedia(
  db: Database.Database,
  mediaId: string,
  keyword: string
): void {
  const normalized = keyword.trim().toLowerCase()
  if (!normalized) return

  db.prepare(
    `DELETE FROM media_keywords
     WHERE media_id = ? AND keyword_id = (SELECT id FROM keywords WHERE keyword = ?)`
  ).run(mediaId, normalized)
}

/**
 * Search keywords by prefix (for autocomplete). Returns up to `limit` matches.
 */
export function searchKeywords(
  db: Database.Database,
  prefix: string,
  limit = 20
): string[] {
  const rows = db
    .prepare('SELECT keyword FROM keywords WHERE keyword LIKE ? ORDER BY keyword LIMIT ?')
    .all(`${prefix.toLowerCase()}%`, limit) as { keyword: string }[]
  return rows.map((r) => r.keyword)
}

/**
 * Get all keywords with their usage count, sorted by count descending.
 */
export function getAllKeywords(
  db: Database.Database
): { keyword: string; count: number }[] {
  return db
    .prepare(
      `SELECT k.keyword, COUNT(mk.media_id) as count
       FROM keywords k
       JOIN media_keywords mk ON mk.keyword_id = k.id
       GROUP BY k.id
       ORDER BY count DESC, k.keyword ASC`
    )
    .all() as { keyword: string; count: number }[]
}

/**
 * Clean up orphaned keywords (no media references).
 */
export function pruneOrphanedKeywords(db: Database.Database): number {
  const result = db
    .prepare(
      `DELETE FROM keywords WHERE id NOT IN (SELECT DISTINCT keyword_id FROM media_keywords)`
    )
    .run()
  return result.changes
}
