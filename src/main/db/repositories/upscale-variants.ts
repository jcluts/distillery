import Database from 'better-sqlite3'
import type { UpscaleVariant } from '../../types'

export function getVariantsForMedia(
  db: Database.Database,
  mediaId: string
): UpscaleVariant[] {
  return db
    .prepare('SELECT * FROM upscale_variants WHERE media_id = ? ORDER BY created_at DESC')
    .all(mediaId) as UpscaleVariant[]
}

export function getVariant(
  db: Database.Database,
  variantId: string
): UpscaleVariant | null {
  return (
    (db.prepare('SELECT * FROM upscale_variants WHERE id = ?').get(variantId) as UpscaleVariant) ??
    null
  )
}

export function insertVariant(db: Database.Database, variant: UpscaleVariant): void {
  db.prepare(
    `INSERT INTO upscale_variants (
      id, media_id, file_path, model_id, model_name,
      scale_factor, width, height, file_size, created_at
    ) VALUES (
      @id, @media_id, @file_path, @model_id, @model_name,
      @scale_factor, @width, @height, @file_size, @created_at
    )`
  ).run(variant)
}

export function deleteVariant(db: Database.Database, variantId: string): void {
  db.prepare('DELETE FROM upscale_variants WHERE id = ?').run(variantId)
}

export function deleteAllVariantsForMedia(db: Database.Database, mediaId: string): void {
  db.prepare('DELETE FROM upscale_variants WHERE media_id = ?').run(mediaId)
}

export function setActiveVariant(
  db: Database.Database,
  mediaId: string,
  variantId: string | null
): void {
  db.prepare('UPDATE media SET active_upscale_id = ? WHERE id = ?').run(variantId, mediaId)
}

export function getActiveVariant(
  db: Database.Database,
  mediaId: string
): UpscaleVariant | null {
  return (
    (db
      .prepare(
        `SELECT uv.* FROM upscale_variants uv
         JOIN media m ON m.active_upscale_id = uv.id
         WHERE m.id = ?`
      )
      .get(mediaId) as UpscaleVariant) ?? null
  )
}

export function getMediaIdsWithUpscales(
  db: Database.Database,
  mediaIds: string[]
): Set<string> {
  if (mediaIds.length === 0) return new Set()
  const placeholders = mediaIds.map(() => '?').join(', ')
  const rows = db
    .prepare(
      `SELECT DISTINCT media_id FROM upscale_variants WHERE media_id IN (${placeholders})`
    )
    .all(...mediaIds) as { media_id: string }[]
  return new Set(rows.map((r) => r.media_id))
}
