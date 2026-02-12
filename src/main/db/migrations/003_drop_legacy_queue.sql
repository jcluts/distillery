-- =============================================================================
-- Remove legacy generation-coupled queue table
-- =============================================================================

DROP INDEX IF EXISTS idx_queue_status;
DROP INDEX IF EXISTS idx_queue_priority;
DROP INDEX IF EXISTS idx_queue_created_at;
DROP TABLE IF EXISTS queue;
