-- Upscale variants table
CREATE TABLE IF NOT EXISTS upscale_variants (
    id TEXT PRIMARY KEY,
    media_id TEXT NOT NULL REFERENCES media(id) ON DELETE CASCADE,
    file_path TEXT NOT NULL,
    model_id TEXT NOT NULL,
    model_name TEXT NOT NULL,
    scale_factor INTEGER NOT NULL,
    width INTEGER NOT NULL,
    height INTEGER NOT NULL,
    file_size INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_upscale_variants_media_id
  ON upscale_variants(media_id);

-- Track active variant per media item (nullable = original is active)
ALTER TABLE media ADD COLUMN active_upscale_id TEXT REFERENCES upscale_variants(id) ON DELETE SET NULL;
