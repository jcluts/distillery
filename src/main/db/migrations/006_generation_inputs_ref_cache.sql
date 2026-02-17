ALTER TABLE generation_inputs ADD COLUMN ref_cache_path TEXT;

CREATE INDEX IF NOT EXISTS idx_generation_inputs_ref_cache_path
  ON generation_inputs(ref_cache_path);
