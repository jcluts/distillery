import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '../channels'
import type { GenerationParams } from '../../types'
import type { QueueManager } from '../../queue/queue-manager'

export function registerGenerationHandlers(queueManager: QueueManager): void {
  ipcMain.handle(
    IPC_CHANNELS.GENERATION_SUBMIT,
    async (_event, params: GenerationParams) => {
      return queueManager.submit(params)
    }
  )

  ipcMain.handle(IPC_CHANNELS.GENERATION_CANCEL, async (_event, jobId: string) => {
    queueManager.cancel(jobId)
  })
}
