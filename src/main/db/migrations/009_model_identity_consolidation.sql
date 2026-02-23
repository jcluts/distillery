-- =============================================================================
-- Model Identity Consolidation
--
-- Replaces the dual system (base_models table + model-identities.json)
-- with a single DB-backed model_identities + model_identity_mappings schema.
-- =============================================================================

-- 1. Create model_identities table
CREATE TABLE IF NOT EXISTS model_identities (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL UNIQUE,
    description TEXT,
    media_type  TEXT NOT NULL DEFAULT 'image',
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 2. Create model_identity_mappings table
CREATE TABLE IF NOT EXISTS model_identity_mappings (
    identity_id       TEXT NOT NULL REFERENCES model_identities(id) ON DELETE CASCADE,
    provider_id       TEXT NOT NULL,
    provider_model_id TEXT NOT NULL,
    created_at        TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (provider_id, provider_model_id)
);

CREATE INDEX IF NOT EXISTS idx_identity_mappings_identity ON model_identity_mappings(identity_id);

-- 3. Seed built-in identities
INSERT OR IGNORE INTO model_identities (id, name, description) VALUES
    ('flux-2-klein-4b', 'Flux 2 Klein 4B', 'FLUX.2 [klein] 4B lightweight text-to-image model'),
    ('flux-2-klein-9b', 'Flux 2 Klein 9B', 'FLUX.2 [klein] 9B text-to-image with enhanced realism');

-- 4. Seed built-in provider mappings
INSERT OR IGNORE INTO model_identity_mappings (identity_id, provider_id, provider_model_id) VALUES
    ('flux-2-klein-4b', 'local', 'flux2-klein-4b'),
    ('flux-2-klein-9b', 'local', 'flux2-klein-9b'),
    ('flux-2-klein-9b', 'fal', 'fal-ai/flux-2/klein/9b/edit'),
    ('flux-2-klein-9b', 'replicate', 'black-forest-labs/flux-2-klein-9b'),
    ('flux-2-klein-9b', 'wavespeed', 'wavespeed-ai/flux-2-klein-9b/text-to-image'),
    ('flux-2-klein-9b', 'wavespeed', 'wavespeed-ai/flux-2-klein-9b/edit');

-- 5. Recreate generations table without the old base_models FK.
--    SQLite's ALTER TABLE RENAME COLUMN does not update FK definitions,
--    so we must rebuild the table to remove the stale FK reference.

CREATE TABLE generations_new (
    id TEXT PRIMARY KEY,
    number INTEGER NOT NULL,
    model_identity_id TEXT,
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

-- Copy data, mapping old base_model_id values to new identity IDs
INSERT INTO generations_new (
    id, number, model_identity_id, provider, model_file, prompt,
    width, height, seed, steps, guidance, sampling_method,
    params_json, status, error, total_time_ms,
    prompt_cache_hit, ref_latent_cache_hit, output_paths,
    created_at, started_at, completed_at
)
SELECT
    id, number,
    CASE base_model_id
        WHEN 'flux2-klein-4b' THEN 'flux-2-klein-4b'
        WHEN 'flux2-klein-9b' THEN 'flux-2-klein-9b'
        ELSE base_model_id
    END,
    provider, model_file, prompt,
    width, height, seed, steps, guidance, sampling_method,
    params_json, status, error, total_time_ms,
    prompt_cache_hit, ref_latent_cache_hit, output_paths,
    created_at, started_at, completed_at
FROM generations;

-- Swap tables
DROP TABLE generations;
ALTER TABLE generations_new RENAME TO generations;

-- Recreate indexes
CREATE INDEX IF NOT EXISTS idx_generations_status ON generations(status);
CREATE INDEX IF NOT EXISTS idx_generations_created_at ON generations(created_at);
CREATE INDEX IF NOT EXISTS idx_generations_model_identity_id ON generations(model_identity_id);

-- 6. Drop the old base_models table
DROP TABLE IF EXISTS base_models;
