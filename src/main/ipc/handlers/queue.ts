import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '../channels'
import { getDatabase } from '../../db/connection'
import * as queueRepo from '../../db/repositories/queue'

export function registerQueueHandlers(): void {
  const db = getDatabase()

  ipcMain.handle(IPC_CHANNELS.QUEUE_GET, () => {
    return queueRepo.getQueueItems(db)
  })
}
