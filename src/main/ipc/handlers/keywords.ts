import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '../channels'
import { getDatabase } from '../../db/connection'
import * as keywordsRepo from '../../db/repositories/keywords'

export function registerKeywordsHandlers(): void {
  const db = getDatabase()

  ipcMain.handle(IPC_CHANNELS.KEYWORDS_GET_FOR_MEDIA, (_event, mediaId: string) => {
    return keywordsRepo.getKeywordsForMedia(db, mediaId)
  })

  ipcMain.handle(
    IPC_CHANNELS.KEYWORDS_SET_FOR_MEDIA,
    (_event, mediaId: string, keywords: string[]) => {
      keywordsRepo.setKeywordsForMedia(db, mediaId, keywords)
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.KEYWORDS_ADD_TO_MEDIA,
    (_event, mediaId: string, keyword: string) => {
      keywordsRepo.addKeywordToMedia(db, mediaId, keyword)
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.KEYWORDS_REMOVE_FROM_MEDIA,
    (_event, mediaId: string, keyword: string) => {
      keywordsRepo.removeKeywordFromMedia(db, mediaId, keyword)
    }
  )

  ipcMain.handle(IPC_CHANNELS.KEYWORDS_SEARCH, (_event, prefix: string, limit?: number) => {
    return keywordsRepo.searchKeywords(db, prefix, limit)
  })

  ipcMain.handle(IPC_CHANNELS.KEYWORDS_GET_ALL, () => {
    return keywordsRepo.getAllKeywords(db)
  })
}
