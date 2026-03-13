import { EventEmitter } from 'events'
import { v4 as uuidv4 } from 'uuid'
import Database from 'better-sqlite3'
import type { EnqueueWorkInput, WorkFilter, WorkItem, WorkResourceResolver } from '../types'
import * as workQueueRepo from '../db/repositories/work-queue'
import { WorkHandlerRegistry, type WorkTaskHandler } from './work-handler-registry'

const taskLimitKey = (taskType: string): string => `task:${taskType}`

export class WorkQueueManager extends EventEmitter {
  private db: Database.Database
  private registry = new WorkHandlerRegistry()
  private activeCounts = new Map<string, number>()
  private concurrencyLimits = new Map<string, number>()
  private activeWorkIds = new Set<string>()
  private resourceResolvers = new Map<string, WorkResourceResolver>()
  private activeResourcesByWorkId = new Map<string, string[]>()

  constructor(db: Database.Database) {
    super()
    this.db = db
  }

  registerHandler(taskType: string, handler: WorkTaskHandler): void {
    this.registry.register(taskType, handler)
  }

  setResourceResolver(taskType: string, resolver: WorkResourceResolver): void {
    this.resourceResolvers.set(taskType, resolver)
    void this.processNext()
  }

  setConcurrencyLimit(taskType: string, limit: number): void {
    this.concurrencyLimits.set(taskLimitKey(taskType), Math.max(1, limit))
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

      const resourceKeys = this.getResourceKeys(item)
      if (!this.canAcquireResources(resourceKeys)) {
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
      this.activeResourcesByWorkId.set(item.id, resourceKeys)
      this.acquireResources(resourceKeys)

      workQueueRepo.updateWorkStatus(this.db, item.id, 'processing')
      workQueueRepo.incrementAttemptCount(this.db, item.id)
      this.emit('updated')

      void this.executeItem(item, handler)
    }
  }

  private getResourceKeys(item: WorkItem): string[] {
    const keys = [taskLimitKey(item.task_type)]
    const resolver = this.resourceResolvers.get(item.task_type)
    if (!resolver) {
      return keys
    }

    for (const key of resolver(item)) {
      if (key && !keys.includes(key)) {
        keys.push(key)
      }
    }

    return keys
  }

  private canAcquireResources(resourceKeys: string[]): boolean {
    return resourceKeys.every((key) => this.getActiveCount(key) < this.getLimitForKey(key))
  }

  private acquireResources(resourceKeys: string[]): void {
    for (const key of resourceKeys) {
      this.activeCounts.set(key, this.getActiveCount(key) + 1)
    }
  }

  private releaseResources(resourceKeys: string[]): void {
    for (const key of resourceKeys) {
      const next = this.getActiveCount(key) - 1
      if (next > 0) {
        this.activeCounts.set(key, next)
      } else {
        this.activeCounts.delete(key)
      }
    }
  }

  private getLimitForKey(key: string): number {
    return this.concurrencyLimits.get(key) ?? 1
  }

  private getActiveCount(key: string): number {
    return this.activeCounts.get(key) ?? 0
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
      const resourceKeys = this.activeResourcesByWorkId.get(item.id) ?? [taskLimitKey(item.task_type)]
      this.activeResourcesByWorkId.delete(item.id)
      this.releaseResources(resourceKeys)

      this.emit('updated')
      void this.processNext()
    }
  }
}
