import Database from 'better-sqlite3'
import type { GenerationInput } from '../../types'

/**
 * Insert a generation input record.
 */
export function insertGenerationInput(
  db: Database.Database,
  input: GenerationInput
): void {
  db.prepare(
    `INSERT INTO generation_inputs (
      id, generation_id, media_id, position, source_type,
      original_path, original_filename, thumb_path, ref_cache_path, created_at
    ) VALUES (
      @id, @generation_id, @media_id, @position, @source_type,
      @original_path, @original_filename, @thumb_path, @ref_cache_path, @created_at
    )`
  ).run(input)
}

export function updateGenerationInputRefCachePath(
  db: Database.Database,
  inputId: string,
  refCachePath: string
): void {
  db
    .prepare('UPDATE generation_inputs SET ref_cache_path = ? WHERE id = ?')
    .run(refCachePath, inputId)
}

/**
 * Get all inputs for a generation, ordered by position.
 */
export function getGenerationInputs(
  db: Database.Database,
  generationId: string
): GenerationInput[] {
  return db
    .prepare(
      'SELECT * FROM generation_inputs WHERE generation_id = ? ORDER BY position'
    )
    .all(generationId) as GenerationInput[]
}

/**
 * Get a single generation input by ID.
 */
export function getGenerationInputById(
  db: Database.Database,
  id: string
): GenerationInput | null {
  return (
    (db
      .prepare('SELECT * FROM generation_inputs WHERE id = ?')
      .get(id) as GenerationInput) ?? null
  )
}
