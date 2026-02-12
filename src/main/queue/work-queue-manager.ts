import { EventEmitter } from 'events'
import { v4 as uuidv4 } from 'uuid'
import Database from 'better-sqlite3'
import type { EnqueueWorkInput, WorkFilter, WorkItem } from '../types'
import * as workQueueRepo from '../db/repositories/work-queue'
import { WorkHandlerRegistry, type WorkTaskHandler } from './work-handler-registry'

export class WorkQueueManager extends EventEmitter {
  private db: Database.Database
  private isProcessing = false
  private registry = new WorkHandlerRegistry()

  constructor(db: Database.Database) {
    super()
    this.db = db
  }

  registerHandler(taskType: string, handler: WorkTaskHandler): void {
    this.registry.register(taskType, handler)
  }

  async enqueue(input: EnqueueWorkInput): Promise<string> {
    const id = uuidv4()
    const workItem = workQueueRepo.createWorkItemFromEnqueueInput(id, input)
    workQueueRepo.insertWorkItem(this.db, workItem)

    this.emit('updated')
    void this.processNext()

    return id
  }

  cancel(workId: string): void {
    const existing = workQueueRepo.getWorkItemById(this.db, workId)
    if (!existing || existing.status !== 'pending') return

    workQueueRepo.updateWorkStatus(this.db, workId, 'cancelled')
    this.emit('updated')
  }

  getItems(filter?: WorkFilter): WorkItem[] {
    return workQueueRepo.getWorkItems(this.db, filter)
  }

  getPendingByCorrelationId(correlationId: string): WorkItem | null {
    return workQueueRepo.getPendingByCorrelationId(this.db, correlationId)
  }

  private async processNext(): Promise<void> {
    if (this.isProcessing) return

    const pending = workQueueRepo.getPendingWorkItems(this.db)
    if (pending.length === 0) return

    const item = pending[0]
    const handler = this.registry.get(item.task_type)

    if (!handler) {
      workQueueRepo.incrementAttemptCount(this.db, item.id)
      workQueueRepo.updateWorkStatus(this.db, item.id, 'failed', `No handler registered for task type: ${item.task_type}`)
      this.emit('updated')
      void this.processNext()
      return
    }

    this.isProcessing = true

    try {
      workQueueRepo.updateWorkStatus(this.db, item.id, 'processing')
      workQueueRepo.incrementAttemptCount(this.db, item.id)
      this.emit('updated')

      const result = await handler.execute(item)
      if (result.success) {
        workQueueRepo.updateWorkStatus(this.db, item.id, 'completed')
      } else {
        workQueueRepo.updateWorkStatus(this.db, item.id, 'failed', result.error)
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      workQueueRepo.updateWorkStatus(this.db, item.id, 'failed', message)
    } finally {
      this.isProcessing = false
      this.emit('updated')
      void this.processNext()
    }
  }
}
