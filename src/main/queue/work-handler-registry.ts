import type { WorkItem, WorkTaskResult } from '../types'

export interface WorkTaskHandler {
  execute(item: WorkItem): Promise<WorkTaskResult>
}

export class WorkHandlerRegistry {
  private handlers = new Map<string, WorkTaskHandler>()

  register(taskType: string, handler: WorkTaskHandler): void {
    this.handlers.set(taskType, handler)
  }

  get(taskType: string): WorkTaskHandler | undefined {
    return this.handlers.get(taskType)
  }
}
