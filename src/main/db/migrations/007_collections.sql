-- =============================================================================
-- Collections foundation (manual + special, live-ready schema)
-- =============================================================================

CREATE TABLE IF NOT EXISTS collections (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    color TEXT NOT NULL DEFAULT 'var(--foreground)',
    type TEXT NOT NULL DEFAULT 'manual',
    system_key TEXT UNIQUE,
    sort_order INTEGER NOT NULL DEFAULT 0,
    filter_json TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS collection_media (
    collection_id TEXT NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
    media_id TEXT NOT NULL REFERENCES media(id) ON DELETE CASCADE,
    sort_order INTEGER NOT NULL DEFAULT 0,
    added_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (collection_id, media_id)
);

CREATE INDEX IF NOT EXISTS idx_collection_media_media ON collection_media(media_id);
CREATE INDEX IF NOT EXISTS idx_collection_media_order ON collection_media(collection_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_collections_sort ON collections(sort_order);

INSERT OR IGNORE INTO collections (id, name, color, type, system_key, sort_order)
VALUES
  ('special-all',       'All Media',  '#6366f1', 'special', 'all',       0),
  ('special-generated', 'Generated',  '#f59e0b', 'special', 'generated', 1),
  ('special-imported',  'Imported',   '#10b981', 'special', 'imported',  2);
