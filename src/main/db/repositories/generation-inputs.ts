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
      original_path, original_filename, thumb_path, created_at
    ) VALUES (
      @id, @generation_id, @media_id, @position, @source_type,
      @original_path, @original_filename, @thumb_path, @created_at
    )`
  ).run(input)
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

/**
 * Delete all inputs for a generation.
 */
export function deleteGenerationInputs(
  db: Database.Database,
  generationId: string
): void {
  db.prepare('DELETE FROM generation_inputs WHERE generation_id = ?').run(
    generationId
  )
}
