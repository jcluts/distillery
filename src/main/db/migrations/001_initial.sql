-- =============================================================================
-- Distillery Initial Schema Migration
-- =============================================================================

-- Base models: canonical model identities
CREATE TABLE IF NOT EXISTS base_models (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    family TEXT NOT NULL,
    media_type TEXT NOT NULL DEFAULT 'image',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Seed initial FLUX.2 Klein models
INSERT OR IGNORE INTO base_models (id, name, family, media_type, created_at) VALUES
    ('flux2-klein-4b', 'FLUX.2 Klein 4B', 'FLUX.2 Klein', 'image', datetime('now')),
    ('flux2-klein-9b', 'FLUX.2 Klein 9B', 'FLUX.2 Klein', 'image', datetime('now'));

-- Generations: one row per generation job
CREATE TABLE IF NOT EXISTS generations (
    id TEXT PRIMARY KEY,
    number INTEGER NOT NULL,
    base_model_id TEXT REFERENCES base_models(id),
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

CREATE INDEX IF NOT EXISTS idx_generations_status ON generations(status);
CREATE INDEX IF NOT EXISTS idx_generations_created_at ON generations(created_at);
CREATE INDEX IF NOT EXISTS idx_generations_base_model_id ON generations(base_model_id);

-- Media origins: provenance tracking
CREATE TABLE IF NOT EXISTS media_origins (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL,
    label TEXT,
    generation_id TEXT REFERENCES generations(id),
    source_media_id TEXT,
    details TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Media: core table, one row per media file
CREATE TABLE IF NOT EXISTS media (
    id TEXT PRIMARY KEY,
    file_path TEXT NOT NULL UNIQUE,
    thumb_path TEXT,
    file_name TEXT NOT NULL,
    media_type TEXT NOT NULL DEFAULT 'image',
    origin TEXT NOT NULL DEFAULT 'import',
    width INTEGER,
    height INTEGER,
    file_size INTEGER,
    rating INTEGER NOT NULL DEFAULT 0,
    status TEXT,
    keywords TEXT,
    generation_id TEXT REFERENCES generations(id),
    origin_id TEXT REFERENCES media_origins(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_media_origin ON media(origin);
CREATE INDEX IF NOT EXISTS idx_media_rating ON media(rating);
CREATE INDEX IF NOT EXISTS idx_media_status ON media(status);
CREATE INDEX IF NOT EXISTS idx_media_media_type ON media(media_type);
CREATE INDEX IF NOT EXISTS idx_media_created_at ON media(created_at);
CREATE INDEX IF NOT EXISTS idx_media_generation_id ON media(generation_id);
CREATE INDEX IF NOT EXISTS idx_media_origin_id ON media(origin_id);

-- Generation inputs: links generations to their reference images
CREATE TABLE IF NOT EXISTS generation_inputs (
    id TEXT PRIMARY KEY,
    generation_id TEXT NOT NULL REFERENCES generations(id),
    media_id TEXT REFERENCES media(id) ON DELETE SET NULL,
    position INTEGER NOT NULL DEFAULT 0,
    source_type TEXT NOT NULL DEFAULT 'library',
    original_path TEXT,
    original_filename TEXT,
    thumb_path TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_generation_inputs_generation_id ON generation_inputs(generation_id);
CREATE INDEX IF NOT EXISTS idx_generation_inputs_media_id ON generation_inputs(media_id);

-- Queue: persistent job queue
CREATE TABLE IF NOT EXISTS queue (
    id TEXT PRIMARY KEY,
    generation_id TEXT NOT NULL REFERENCES generations(id),
    status TEXT NOT NULL DEFAULT 'pending',
    priority INTEGER NOT NULL DEFAULT 0,
    error_message TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    started_at TEXT,
    completed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_queue_status ON queue(status);
CREATE INDEX IF NOT EXISTS idx_queue_priority ON queue(priority);
CREATE INDEX IF NOT EXISTS idx_queue_created_at ON queue(created_at);

-- App settings: key-value store
CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT
);

-- Migrations tracking table
CREATE TABLE IF NOT EXISTS _migrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    applied_at TEXT NOT NULL DEFAULT (datetime('now'))
);
