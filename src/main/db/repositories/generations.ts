import Database from 'better-sqlite3'
import type { GenerationRecord } from '../../types'

type GenerationRow = Omit<GenerationRecord, 'prompt_cache_hit' | 'ref_latent_cache_hit'> & {
  prompt_cache_hit: number
  ref_latent_cache_hit: number
}

const GENERATION_WITH_MODEL_IDENTITY_SELECT = `
  SELECT
    generations.*,
    COALESCE(direct_identity.id, mapped.identity_id) AS canonical_model_id,
    COALESCE(direct_identity.name, mapped_identity.name) AS canonical_model_name
  FROM generations
  LEFT JOIN model_identities direct_identity
    ON direct_identity.id = generations.model_identity_id
  LEFT JOIN model_identity_mappings mapped
    ON mapped.provider_id = generations.provider
   AND mapped.provider_model_id = generations.model_file
  LEFT JOIN model_identities mapped_identity
    ON mapped_identity.id = mapped.identity_id
`

function toGenerationRecord(row: GenerationRow): GenerationRecord {
  return {
    ...row,
    prompt_cache_hit: !!row.prompt_cache_hit,
    ref_latent_cache_hit: !!row.ref_latent_cache_hit
  }
}

/**
 * Insert a new generation record.
 */
export function insertGeneration(db: Database.Database, gen: GenerationRecord): void {
  db.prepare(
    `INSERT INTO generations (
      id, number, model_identity_id, provider, model_file, prompt,
      width, height, seed, steps, guidance, sampling_method,
      params_json, status, error, total_time_ms,
      prompt_cache_hit, ref_latent_cache_hit, output_paths,
      created_at, started_at, completed_at
    ) VALUES (
      @id, @number, @model_identity_id, @provider, @model_file, @prompt,
      @width, @height, @seed, @steps, @guidance, @sampling_method,
      @params_json, @status, @error, @total_time_ms,
      @prompt_cache_hit, @ref_latent_cache_hit, @output_paths,
      @created_at, @started_at, @completed_at
    )`
  ).run({
    ...gen,
    prompt_cache_hit: gen.prompt_cache_hit ? 1 : 0,
    ref_latent_cache_hit: gen.ref_latent_cache_hit ? 1 : 0
  })
}

/**
 * Get a generation by ID.
 */
export function getGenerationById(
  db: Database.Database,
  id: string
): GenerationRecord | null {
  const row = db
    .prepare(`${GENERATION_WITH_MODEL_IDENTITY_SELECT} WHERE generations.id = ?`)
    .get(id) as GenerationRow | undefined
  if (!row) return null
  return toGenerationRecord(row)
}

/**
 * Get all generations, newest first.
 */
export function getAllGenerations(db: Database.Database): GenerationRecord[] {
  const rows = db
    .prepare(`${GENERATION_WITH_MODEL_IDENTITY_SELECT} ORDER BY generations.created_at DESC`)
    .all() as GenerationRow[]

  return rows.map(toGenerationRecord)
}

/**
 * Update generation status and related fields on completion.
 */
export function updateGenerationComplete(
  db: Database.Database,
  id: string,
  updates: {
    status: 'completed' | 'failed'
    seed?: number
    total_time_ms?: number
    prompt_cache_hit?: boolean
    ref_latent_cache_hit?: boolean
    output_paths?: string
    error?: string
  }
): void {
  db.prepare(
    `UPDATE generations SET
      status = @status,
      seed = COALESCE(@seed, seed),
      total_time_ms = COALESCE(@total_time_ms, total_time_ms),
      prompt_cache_hit = COALESCE(@prompt_cache_hit, prompt_cache_hit),
      ref_latent_cache_hit = COALESCE(@ref_latent_cache_hit, ref_latent_cache_hit),
      output_paths = COALESCE(@output_paths, output_paths),
      error = @error,
      completed_at = datetime('now')
    WHERE id = @id`
  ).run({
    id,
    status: updates.status,
    seed: updates.seed ?? null,
    total_time_ms: updates.total_time_ms ?? null,
    prompt_cache_hit: updates.prompt_cache_hit ? 1 : null,
    ref_latent_cache_hit: updates.ref_latent_cache_hit ? 1 : null,
    output_paths: updates.output_paths ?? null,
    error: updates.error ?? null
  })
}

/**
 * Update generation status to processing.
 */
export function markGenerationStarted(db: Database.Database, id: string): void {
  db.prepare(
    "UPDATE generations SET started_at = datetime('now') WHERE id = ?"
  ).run(id)
}

/**
 * Remove a generation record and its inputs.
 */
export function removeGeneration(db: Database.Database, id: string): void {
  db.transaction(() => {
    db.prepare('DELETE FROM generation_inputs WHERE generation_id = ?').run(id)
    db.prepare('DELETE FROM work_queue WHERE correlation_id = ?').run(id)
    db.prepare('DELETE FROM generations WHERE id = ?').run(id)
  })()
}

/**
 * Get the next generation number.
 */
export function getNextGenerationNumber(db: Database.Database): number {
  const row = db
    .prepare('SELECT COALESCE(MAX(number), 0) + 1 as next FROM generations')
    .get() as { next: number }
  return row.next
}

/**
 * Mark any pending generations from previous session as failed (interrupted).
 */
export function markInterruptedGenerations(db: Database.Database): void {
  db.prepare(
    "UPDATE generations SET status = 'failed', error = 'Interrupted by application restart' WHERE status = 'pending'"
  ).run()
}
