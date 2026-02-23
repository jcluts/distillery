CREATE TABLE import_folders (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  path TEXT NOT NULL,
  import_mode TEXT NOT NULL DEFAULT 'copy',
  recursive INTEGER NOT NULL DEFAULT 1,
  persist INTEGER NOT NULL DEFAULT 1,
  auto_import INTEGER NOT NULL DEFAULT 0,
  target_collection_id TEXT,
  initial_keywords TEXT,
  last_scanned TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY(target_collection_id) REFERENCES collections(id) ON DELETE SET NULL
);
