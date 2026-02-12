import type { QueueItem, WorkItem } from '../types'

export function mapWorkItemToQueueItem(item: WorkItem): QueueItem {
  return {
    id: item.id,
    generation_id: item.correlation_id ?? item.id,
    status: item.status,
    priority: item.priority,
    error_message: item.error_message,
    created_at: item.created_at,
    started_at: item.started_at,
    completed_at: item.completed_at
  }
}

export function mapWorkItemsToQueueItems(items: WorkItem[]): QueueItem[] {
  return items
    .filter((item) => item.owner_module === 'generation')
    .map(mapWorkItemToQueueItem)
}
