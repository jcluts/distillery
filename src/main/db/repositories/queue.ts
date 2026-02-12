import Database from 'better-sqlite3'
import type { QueueItem } from '../../types'

/**
 * Insert a queue item.
 */
export function insertQueueItem(db: Database.Database, item: QueueItem): void {
  db.prepare(
    `INSERT INTO queue (
      id, generation_id, status, priority, error_message,
      created_at, started_at, completed_at
    ) VALUES (
      @id, @generation_id, @status, @priority, @error_message,
      @created_at, @started_at, @completed_at
    )`
  ).run(item)
}

/**
 * Get all queue items, ordered by priority (desc) then created_at (asc).
 */
export function getQueueItems(db: Database.Database): QueueItem[] {
  return db
    .prepare(
      'SELECT * FROM queue ORDER BY priority DESC, created_at ASC'
    )
    .all() as QueueItem[]
}

/**
 * Get pending queue items (ready to process).
 */
export function getPendingQueueItems(db: Database.Database): QueueItem[] {
  return db
    .prepare(
      "SELECT * FROM queue WHERE status = 'pending' ORDER BY priority DESC, created_at ASC"
    )
    .all() as QueueItem[]
}

/**
 * Update queue item status.
 */
export function updateQueueStatus(
  db: Database.Database,
  id: string,
  status: string,
  errorMessage?: string
): void {
  const now = new Date().toISOString()

  if (status === 'processing') {
    db.prepare('UPDATE queue SET status = ?, started_at = ? WHERE id = ?').run(
      status,
      now,
      id
    )
  } else if (status === 'completed' || status === 'failed' || status === 'cancelled') {
    db.prepare(
      'UPDATE queue SET status = ?, error_message = ?, completed_at = ? WHERE id = ?'
    ).run(status, errorMessage ?? null, now, id)
  } else {
    db.prepare('UPDATE queue SET status = ? WHERE id = ?').run(status, id)
  }
}

/**
 * Cancel a pending queue item.
 */
export function cancelQueueItem(db: Database.Database, id: string): void {
  updateQueueStatus(db, id, 'cancelled')
}

/**
 * Mark any processing items from previous session as failed.
 */
export function markInterruptedQueueItems(db: Database.Database): void {
  db.prepare(
    "UPDATE queue SET status = 'failed', error_message = 'Interrupted by application restart' WHERE status IN ('pending', 'processing')"
  ).run()
}
