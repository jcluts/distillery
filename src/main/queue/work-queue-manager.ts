import { EventEmitter } from 'events'
import { v4 as uuidv4 } from 'uuid'
import Database from 'better-sqlite3'
import type { EnqueueWorkInput, WorkFilter, WorkItem } from '../types'
import * as workQueueRepo from '../db/repositories/work-queue'
import { WorkHandlerRegistry, type WorkTaskHandler } from './work-handler-registry'

export class WorkQueueManager extends EventEmitter {
  private db: Database.Database
  private registry = new WorkHandlerRegistry()
  private activeCounts = new Map<string, number>()
  private concurrencyLimits = new Map<string, number>()
  private activeWorkIds = new Set<string>()

  constructor(db: Database.Database) {
    super()
    this.db = db
  }

  registerHandler(taskType: string, handler: WorkTaskHandler): void {
    this.registry.register(taskType, handler)
  }

  setConcurrencyLimit(taskType: string, limit: number): void {
    this.concurrencyLimits.set(taskType, Math.max(1, limit))
    void this.processNext()
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
    const pending = workQueueRepo.getPendingWorkItems(this.db)
    if (pending.length === 0) return

    for (const item of pending) {
      if (this.activeWorkIds.has(item.id)) {
        continue
      }

      const active = this.getActiveCount(item.task_type)
      const limit = this.getConcurrencyLimit(item.task_type)
      if (active >= limit) {
        continue
      }

      const handler = this.registry.get(item.task_type)
      if (!handler) {
        workQueueRepo.incrementAttemptCount(this.db, item.id)
        workQueueRepo.updateWorkStatus(
          this.db,
          item.id,
          'failed',
          `No handler registered for task type: ${item.task_type}`
        )
        this.emit('updated')
        continue
      }

      this.activeWorkIds.add(item.id)
      this.activeCounts.set(item.task_type, active + 1)

      workQueueRepo.updateWorkStatus(this.db, item.id, 'processing')
      workQueueRepo.incrementAttemptCount(this.db, item.id)
      this.emit('updated')

      void this.executeItem(item, handler)
    }
  }

  private getConcurrencyLimit(taskType: string): number {
    return this.concurrencyLimits.get(taskType) ?? 1
  }

  private getActiveCount(taskType: string): number {
    return this.activeCounts.get(taskType) ?? 0
  }

  private async executeItem(item: WorkItem, handler: WorkTaskHandler): Promise<void> {
    try {
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
      this.activeWorkIds.delete(item.id)

      const active = this.getActiveCount(item.task_type)
      this.activeCounts.set(item.task_type, Math.max(0, active - 1))

      this.emit('updated')
      void this.processNext()
    }
  }
}
