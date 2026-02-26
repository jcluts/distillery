import { ipcMain } from 'electron'

import { IPC_CHANNELS } from '../channels'
import type { RemovalData } from '../../types'
import type { RemovalService } from '../../removal/removal-service'

export function registerRemovalHandlers(
  removalService: RemovalService,
  options?: { onLibraryUpdated?: () => void }
): void {
  ipcMain.handle(IPC_CHANNELS.REMOVAL_GET_DATA, (_event, mediaId: string) => {
    return removalService.getState(mediaId)
  })

  ipcMain.handle(IPC_CHANNELS.REMOVAL_SAVE_DATA, async (_event, mediaId: string, data: RemovalData | null) => {
    removalService.saveData(mediaId, data)
    try {
      await removalService.refreshThumbnail(mediaId)
    } catch (error) {
      console.warn('[RemovalIPC] Failed to refresh thumbnail after save:', error)
    }
    options?.onLibraryUpdated?.()
  })

  ipcMain.handle(IPC_CHANNELS.REMOVAL_PROCESS, async (_event, mediaId: string, operationId: string) => {
    return await removalService.process(mediaId, operationId)
  })

  ipcMain.handle(IPC_CHANNELS.REMOVAL_PROCESS_ALL_STALE, async (_event, mediaId: string) => {
    return await removalService.processAllStale(mediaId)
  })

  ipcMain.handle(
    IPC_CHANNELS.REMOVAL_DELETE_CACHES,
    async (_event, mediaId: string, operationIds?: string[]) => {
      await removalService.deleteCaches(mediaId, operationIds)
      try {
        await removalService.refreshThumbnail(mediaId)
      } catch (error) {
        console.warn('[RemovalIPC] Failed to refresh thumbnail after cache deletion:', error)
      }
      options?.onLibraryUpdated?.()
    }
  )
}
