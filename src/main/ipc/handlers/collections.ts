import { ipcMain } from 'electron'

import { getDatabase } from '../../db/connection'
import { IPC_CHANNELS } from '../channels'
import * as collectionsRepo from '../../db/repositories/collections'
import type { CollectionCreate, CollectionUpdate } from '../../types'

export function registerCollectionsHandlers(options?: {
  onCollectionsUpdated?: () => void
  onLibraryUpdated?: () => void
}): void {
  const db = getDatabase()

  ipcMain.handle(IPC_CHANNELS.COLLECTIONS_GET_ALL, () => {
    return collectionsRepo.getAllCollections(db)
  })

  ipcMain.handle(IPC_CHANNELS.COLLECTIONS_GET, (_event, id: string) => {
    return collectionsRepo.getCollectionById(db, id)
  })

  ipcMain.handle(IPC_CHANNELS.COLLECTIONS_CREATE, (_event, data: CollectionCreate) => {
    const created = collectionsRepo.createCollection(db, data)
    options?.onCollectionsUpdated?.()
    return created
  })

  ipcMain.handle(
    IPC_CHANNELS.COLLECTIONS_UPDATE,
    (_event, id: string, data: CollectionUpdate) => {
      collectionsRepo.updateCollection(db, id, data)
      options?.onCollectionsUpdated?.()
    }
  )

  ipcMain.handle(IPC_CHANNELS.COLLECTIONS_DELETE, (_event, id: string) => {
    collectionsRepo.deleteCollection(db, id)
    options?.onCollectionsUpdated?.()
    options?.onLibraryUpdated?.()
  })

  ipcMain.handle(IPC_CHANNELS.COLLECTIONS_REORDER, (_event, orderedIds: string[]) => {
    collectionsRepo.reorderCollections(db, orderedIds)
    options?.onCollectionsUpdated?.()
  })

  ipcMain.handle(
    IPC_CHANNELS.COLLECTIONS_ADD_MEDIA,
    (_event, collectionId: string, mediaIds: string[]) => {
      collectionsRepo.addMediaToCollection(db, collectionId, mediaIds)
      options?.onCollectionsUpdated?.()
      options?.onLibraryUpdated?.()
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.COLLECTIONS_REMOVE_MEDIA,
    (_event, collectionId: string, mediaIds: string[]) => {
      collectionsRepo.removeMediaFromCollection(db, collectionId, mediaIds)
      options?.onCollectionsUpdated?.()
      options?.onLibraryUpdated?.()
    }
  )
}
