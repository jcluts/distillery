import { ipcMain } from 'electron'

import { getDatabase } from '../../db/connection'
import * as mediaRepo from '../../db/repositories/media'
import type { VideoEdits } from '../../types'
import { IPC_CHANNELS } from '../channels'

export function registerVideoEditsHandlers(): void {
  const db = getDatabase()

  ipcMain.handle(IPC_CHANNELS.VIDEO_EDITS_GET, (_event, mediaId: string) => {
    return mediaRepo.getVideoEdits(db, mediaId)
  })

  ipcMain.handle(
    IPC_CHANNELS.VIDEO_EDITS_SAVE,
    (_event, mediaId: string, edits: VideoEdits | null) => {
      mediaRepo.saveVideoEdits(db, mediaId, edits)
    }
  )
}