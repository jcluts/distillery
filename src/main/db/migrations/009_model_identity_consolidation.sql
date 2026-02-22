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

-- 5. Migrate existing base_model_id values to the new identity IDs
UPDATE generations SET base_model_id = 'flux-2-klein-4b' WHERE base_model_id = 'flux2-klein-4b';
UPDATE generations SET base_model_id = 'flux-2-klein-9b' WHERE base_model_id = 'flux2-klein-9b';

-- 6. Rename column: base_model_id → model_identity_id
ALTER TABLE generations RENAME COLUMN base_model_id TO model_identity_id;

-- 7. Drop old index and create new one
DROP INDEX IF EXISTS idx_generations_base_model_id;
CREATE INDEX IF NOT EXISTS idx_generations_model_identity_id ON generations(model_identity_id);

-- 8. Drop the old base_models table
DROP TABLE IF EXISTS base_models;
