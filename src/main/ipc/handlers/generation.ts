import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '../channels'
import type { GenerationParams } from '../../types'

export function registerGenerationHandlers(): void {
  ipcMain.handle(
    IPC_CHANNELS.GENERATION_SUBMIT,
    async (_event, _params: GenerationParams) => {
      // TODO: Wire up to QueueManager
      // 1. Create generation record
      // 2. Create queue record
      // 3. Trigger queue processing
      return 'placeholder-job-id'
    }
  )

  ipcMain.handle(IPC_CHANNELS.GENERATION_CANCEL, async (_event, _jobId: string) => {
    // TODO: Wire up to QueueManager
  })
}
