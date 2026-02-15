-- =============================================================================
-- Normalize keywords: comma-separated TEXT column → junction tables
-- =============================================================================

-- Canonical keyword lookup table (case-insensitive unique via COLLATE NOCASE)
CREATE TABLE IF NOT EXISTS keywords (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    keyword TEXT NOT NULL UNIQUE COLLATE NOCASE
);

-- Junction table: many-to-many relationship between media and keywords
CREATE TABLE IF NOT EXISTS media_keywords (
    media_id TEXT NOT NULL REFERENCES media(id) ON DELETE CASCADE,
    keyword_id INTEGER NOT NULL REFERENCES keywords(id) ON DELETE CASCADE,
    PRIMARY KEY (media_id, keyword_id)
);

CREATE INDEX IF NOT EXISTS idx_media_keywords_keyword_id ON media_keywords(keyword_id);

-- Migrate existing comma-separated keywords data into the new tables.
-- Uses a recursive CTE to split the comma-separated values.
INSERT OR IGNORE INTO keywords (keyword)
WITH RECURSIVE split(media_id, keyword, rest) AS (
    SELECT id,
           TRIM(SUBSTR(keywords, 1, INSTR(keywords || ',', ',') - 1)),
           SUBSTR(keywords, INSTR(keywords || ',', ',') + 1)
    FROM media
    WHERE keywords IS NOT NULL AND TRIM(keywords) != ''
    UNION ALL
    SELECT media_id,
           TRIM(SUBSTR(rest, 1, INSTR(rest || ',', ',') - 1)),
           SUBSTR(rest, INSTR(rest || ',', ',') + 1)
    FROM split
    WHERE rest != ''
)
SELECT DISTINCT LOWER(keyword) FROM split WHERE TRIM(keyword) != '';

INSERT OR IGNORE INTO media_keywords (media_id, keyword_id)
WITH RECURSIVE split(media_id, keyword, rest) AS (
    SELECT id,
           TRIM(SUBSTR(keywords, 1, INSTR(keywords || ',', ',') - 1)),
           SUBSTR(keywords, INSTR(keywords || ',', ',') + 1)
    FROM media
    WHERE keywords IS NOT NULL AND TRIM(keywords) != ''
    UNION ALL
    SELECT media_id,
           TRIM(SUBSTR(rest, 1, INSTR(rest || ',', ',') - 1)),
           SUBSTR(rest, INSTR(rest || ',', ',') + 1)
    FROM split
    WHERE rest != ''
)
SELECT split.media_id, k.id
FROM split
JOIN keywords k ON k.keyword = LOWER(split.keyword)
WHERE TRIM(split.keyword) != '';

-- Drop the old denormalized column
ALTER TABLE media DROP COLUMN keywords;
