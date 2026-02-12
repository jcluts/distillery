import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '../channels'
import { getDatabase } from '../../db/connection'
import * as mediaRepo from '../../db/repositories/media'
import type { MediaQuery, MediaUpdate } from '../../types'

export function registerLibraryHandlers(): void {
  const db = getDatabase()

  ipcMain.handle(IPC_CHANNELS.LIBRARY_GET_MEDIA, (_event, params: MediaQuery) => {
    return mediaRepo.queryMedia(db, params)
  })

  ipcMain.handle(IPC_CHANNELS.LIBRARY_GET_MEDIA_BY_ID, (_event, id: string) => {
    return mediaRepo.getMediaById(db, id)
  })

  ipcMain.handle(
    IPC_CHANNELS.LIBRARY_UPDATE_MEDIA,
    (_event, id: string, updates: MediaUpdate) => {
      mediaRepo.updateMedia(db, id, updates)
    }
  )

  ipcMain.handle(IPC_CHANNELS.LIBRARY_DELETE_MEDIA, (_event, ids: string[]) => {
    mediaRepo.deleteMedia(db, ids)
  })

  ipcMain.handle(IPC_CHANNELS.LIBRARY_IMPORT_MEDIA, async (_event, _filePaths: string[]) => {
    // TODO: Implement file import (copy to library, generate thumbnail, create media record)
    return []
  })

  ipcMain.handle(IPC_CHANNELS.LIBRARY_GET_THUMBNAIL, (_event, id: string) => {
    const media = mediaRepo.getMediaById(db, id)
    return media?.thumb_path ?? null
  })

  ipcMain.handle(
    IPC_CHANNELS.LIBRARY_GET_THUMBNAILS_BATCH,
    (_event, ids: string[]) => {
      const result: Record<string, string> = {}
      for (const id of ids) {
        const media = mediaRepo.getMediaById(db, id)
        if (media?.thumb_path) {
          result[id] = media.thumb_path
        }
      }
      return result
    }
  )
}
