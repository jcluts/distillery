import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '../channels'
import type { WorkQueueManager } from '../../queue/work-queue-manager'
import { mapWorkItemsToQueueItems } from '../../queue/work-queue-view'

export function registerQueueHandlers(workQueueManager: WorkQueueManager): void {
  ipcMain.handle(IPC_CHANNELS.QUEUE_GET, () => {
    return mapWorkItemsToQueueItems(workQueueManager.getItems())
  })
}
