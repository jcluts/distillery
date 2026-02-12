-- =============================================================================
-- Distillery work_queue migration
-- =============================================================================

CREATE TABLE IF NOT EXISTS work_queue (
    id TEXT PRIMARY KEY,
    task_type TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    priority INTEGER NOT NULL DEFAULT 0,
    payload_json TEXT NOT NULL,
    correlation_id TEXT,
    owner_module TEXT NOT NULL,
    error_message TEXT,
    attempt_count INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    started_at TEXT,
    completed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_work_queue_dequeue
  ON work_queue(status, priority, created_at);

CREATE INDEX IF NOT EXISTS idx_work_queue_correlation_id
  ON work_queue(correlation_id);

CREATE INDEX IF NOT EXISTS idx_work_queue_owner_module
  ON work_queue(owner_module);

INSERT INTO work_queue (
    id,
    task_type,
    status,
    priority,
    payload_json,
    correlation_id,
    owner_module,
    error_message,
    attempt_count,
    max_attempts,
    created_at,
    started_at,
    completed_at
)
SELECT
    q.id,
    'generation.local.image',
    q.status,
    q.priority,
    '{"generationId":"' || q.generation_id || '"}',
    q.generation_id,
    'generation',
    q.error_message,
    0,
    1,
    q.created_at,
    q.started_at,
    q.completed_at
FROM queue q
WHERE NOT EXISTS (SELECT 1 FROM work_queue w WHERE w.id = q.id);
