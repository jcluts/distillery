import { ipcMain } from 'electron'

import { getDatabase } from '../../db/connection'
import * as mediaRepo from '../../db/repositories/media'
import type { ImageAdjustments } from '../../types'
import { IPC_CHANNELS } from '../channels'

export function registerAdjustmentsHandlers(): void {
  const db = getDatabase()

  ipcMain.handle(IPC_CHANNELS.ADJUSTMENTS_GET, (_event, mediaId: string) => {
    return mediaRepo.getAdjustments(db, mediaId)
  })

  ipcMain.handle(
    IPC_CHANNELS.ADJUSTMENTS_SAVE,
    (_event, mediaId: string, adjustments: ImageAdjustments | null) => {
      mediaRepo.saveAdjustments(db, mediaId, adjustments)
    }
  )
}