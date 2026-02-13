import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '../channels'
import type { WorkQueueManager } from '../../queue/work-queue-manager'

export function registerQueueHandlers(workQueueManager: WorkQueueManager): void {
  ipcMain.handle(IPC_CHANNELS.QUEUE_GET, () => {
    return workQueueManager.getItems({ owner_module: 'generation' })
  })
}
