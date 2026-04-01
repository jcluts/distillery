CREATE TABLE prompt_collections (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    parent_id TEXT REFERENCES prompt_collections(id) ON DELETE CASCADE,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX idx_prompt_collections_parent_id ON prompt_collections(parent_id);
CREATE INDEX idx_prompt_collections_sort_order ON prompt_collections(parent_id, sort_order);

CREATE TABLE prompts (
    id TEXT PRIMARY KEY,
    title TEXT,
    text TEXT NOT NULL,
    rating INTEGER NOT NULL DEFAULT 0 CHECK (rating >= 0 AND rating <= 5),
    use_count INTEGER NOT NULL DEFAULT 0,
    collection_id TEXT REFERENCES prompt_collections(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    last_used_at TEXT
);

CREATE INDEX idx_prompts_rating ON prompts(rating);
CREATE INDEX idx_prompts_use_count ON prompts(use_count);
CREATE INDEX idx_prompts_collection_id ON prompts(collection_id);
CREATE INDEX idx_prompts_created_at ON prompts(created_at);