import type { WorkTaskHandler } from './work-handler-registry'
import type { WorkItem, WorkTaskResult } from '../types'

export class PlaceholderHeavyTaskHandler implements WorkTaskHandler {
  async execute(_item: WorkItem): Promise<WorkTaskResult> {
    return { success: true }
  }
}
