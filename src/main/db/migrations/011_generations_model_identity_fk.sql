-- =============================================================================
-- Enforce generations -> model_identities foreign key
-- =============================================================================

-- Normalize legacy identity IDs (pre-consolidation values)
UPDATE generations
SET model_identity_id = 'flux-2-klein-4b'
WHERE model_identity_id = 'flux2-klein-4b';

UPDATE generations
SET model_identity_id = 'flux-2-klein-9b'
WHERE model_identity_id = 'flux2-klein-9b';

-- Backfill missing model_identity_id from provider/model mapping when possible
UPDATE generations
SET model_identity_id = (
    SELECT m.identity_id
    FROM model_identity_mappings m
    WHERE m.provider_id = generations.provider
      AND m.provider_model_id = generations.model_file
)
WHERE (model_identity_id IS NULL OR trim(model_identity_id) = '')
  AND provider IS NOT NULL
  AND model_file IS NOT NULL
  AND EXISTS (
      SELECT 1
      FROM model_identity_mappings m
      WHERE m.provider_id = generations.provider
        AND m.provider_model_id = generations.model_file
  );

-- Null out any orphan model_identity_id values that do not exist in model_identities
UPDATE generations
SET model_identity_id = NULL
WHERE model_identity_id IS NOT NULL
  AND NOT EXISTS (
      SELECT 1
      FROM model_identities mi
      WHERE mi.id = generations.model_identity_id
  );

-- Rebuild generations table with a real FK constraint
CREATE TABLE generations_new (
    id TEXT PRIMARY KEY,
    number INTEGER NOT NULL,
    model_identity_id TEXT REFERENCES model_identities(id) ON DELETE SET NULL,
    provider TEXT NOT NULL DEFAULT 'local',
    model_file TEXT,
    prompt TEXT,
    width INTEGER,
    height INTEGER,
    seed INTEGER,
    steps INTEGER,
    guidance REAL,
    sampling_method TEXT,
    params_json TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    error TEXT,
    total_time_ms INTEGER,
    prompt_cache_hit INTEGER DEFAULT 0,
    ref_latent_cache_hit INTEGER DEFAULT 0,
    output_paths TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    started_at TEXT,
    completed_at TEXT
);

INSERT INTO generations_new (
    id, number, model_identity_id, provider, model_file, prompt,
    width, height, seed, steps, guidance, sampling_method,
    params_json, status, error, total_time_ms,
    prompt_cache_hit, ref_latent_cache_hit, output_paths,
    created_at, started_at, completed_at
)
SELECT
    id, number, model_identity_id, provider, model_file, prompt,
    width, height, seed, steps, guidance, sampling_method,
    params_json, status, error, total_time_ms,
    prompt_cache_hit, ref_latent_cache_hit, output_paths,
    created_at, started_at, completed_at
FROM generations;

DROP TABLE generations;
ALTER TABLE generations_new RENAME TO generations;

CREATE INDEX IF NOT EXISTS idx_generations_status ON generations(status);
CREATE INDEX IF NOT EXISTS idx_generations_created_at ON generations(created_at);
CREATE INDEX IF NOT EXISTS idx_generations_model_identity_id ON generations(model_identity_id);
