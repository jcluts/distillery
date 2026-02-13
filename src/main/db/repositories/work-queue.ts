import Database from 'better-sqlite3'
import type { EnqueueWorkInput, QueueStatus, WorkFilter, WorkItem } from '../../types'

export function insertWorkItem(db: Database.Database, item: WorkItem): void {
  db.prepare(
    `INSERT INTO work_queue (
      id, task_type, status, priority, payload_json,
      correlation_id, owner_module, error_message,
      attempt_count, max_attempts, created_at, started_at, completed_at
    ) VALUES (
      @id, @task_type, @status, @priority, @payload_json,
      @correlation_id, @owner_module, @error_message,
      @attempt_count, @max_attempts, @created_at, @started_at, @completed_at
    )`
  ).run(item)
}

export function createWorkItemFromEnqueueInput(id: string, input: EnqueueWorkInput): WorkItem {
  const now = new Date().toISOString()
  return {
    id,
    task_type: input.task_type,
    status: 'pending',
    priority: input.priority ?? 0,
    payload_json: input.payload_json,
    correlation_id: input.correlation_id ?? null,
    owner_module: input.owner_module,
    error_message: null,
    attempt_count: 0,
    max_attempts: Math.max(1, input.max_attempts ?? 1),
    created_at: now,
    started_at: null,
    completed_at: null
  }
}

export function getWorkItemById(db: Database.Database, id: string): WorkItem | null {
  return (
    (db.prepare('SELECT * FROM work_queue WHERE id = ?').get(id) as WorkItem | undefined) ?? null
  )
}

export function getWorkItems(db: Database.Database, filter?: WorkFilter): WorkItem[] {
  const clauses: string[] = []
  const values: unknown[] = []

  if (filter?.status) {
    clauses.push('status = ?')
    values.push(filter.status)
  }

  if (filter?.task_type) {
    clauses.push('task_type = ?')
    values.push(filter.task_type)
  }

  if (filter?.owner_module) {
    clauses.push('owner_module = ?')
    values.push(filter.owner_module)
  }

  const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : ''

  return db
    .prepare(`SELECT * FROM work_queue ${where} ORDER BY priority DESC, created_at ASC`)
    .all(...values) as WorkItem[]
}

export function getPendingWorkItems(db: Database.Database): WorkItem[] {
  return db
    .prepare("SELECT * FROM work_queue WHERE status = 'pending' ORDER BY priority DESC, created_at ASC")
    .all() as WorkItem[]
}

export function getPendingByCorrelationId(
  db: Database.Database,
  correlationId: string
): WorkItem | null {
  return (
    (db
      .prepare("SELECT * FROM work_queue WHERE correlation_id = ? AND status = 'pending' ORDER BY created_at ASC LIMIT 1")
      .get(correlationId) as WorkItem | undefined) ?? null
  )
}

export function updateWorkStatus(
  db: Database.Database,
  id: string,
  status: QueueStatus,
  errorMessage?: string
): void {
  const now = new Date().toISOString()

  if (status === 'processing') {
    db.prepare('UPDATE work_queue SET status = ?, started_at = ?, error_message = NULL WHERE id = ?').run(
      status,
      now,
      id
    )
    return
  }

  if (status === 'completed' || status === 'failed' || status === 'cancelled') {
    db.prepare(
      'UPDATE work_queue SET status = ?, error_message = ?, completed_at = ? WHERE id = ?'
    ).run(status, errorMessage ?? null, now, id)
    return
  }

  db.prepare('UPDATE work_queue SET status = ? WHERE id = ?').run(status, id)
}

export function incrementAttemptCount(db: Database.Database, id: string): void {
  db.prepare('UPDATE work_queue SET attempt_count = attempt_count + 1 WHERE id = ?').run(id)
}

export function markInterruptedWorkItems(db: Database.Database): void {
  db.prepare(
    "UPDATE work_queue SET status = 'failed', error_message = 'Interrupted by application restart', completed_at = datetime('now') WHERE status IN ('pending', 'processing')"
  ).run()
}
