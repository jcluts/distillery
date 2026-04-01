import { ipcMain } from 'electron'

import { getDatabase } from '../../db/connection'
import { IPC_CHANNELS } from '../channels'
import * as promptRepo from '../../db/repositories/prompts'
import type { PromptCollectionCreate, PromptCreate, PromptUpdate } from '../../types'

export function registerPromptHandlers(): void {
  const db = getDatabase()

  ipcMain.handle(IPC_CHANNELS.PROMPTS_GET_ALL, () => {
    return promptRepo.getAllPrompts(db)
  })

  ipcMain.handle(IPC_CHANNELS.PROMPTS_SEARCH, (_event, query: string) => {
    return promptRepo.searchPrompts(db, query)
  })

  ipcMain.handle(IPC_CHANNELS.PROMPTS_GET_BY_COLLECTION, (_event, collectionId: string) => {
    return promptRepo.getPromptsByCollection(db, collectionId)
  })

  ipcMain.handle(IPC_CHANNELS.PROMPTS_CREATE, (_event, data: PromptCreate) => {
    return promptRepo.insertPrompt(db, data)
  })

  ipcMain.handle(IPC_CHANNELS.PROMPTS_UPDATE, (_event, id: string, data: PromptUpdate) => {
    return promptRepo.updatePrompt(db, id, data) ?? null
  })

  ipcMain.handle(IPC_CHANNELS.PROMPTS_DELETE, (_event, id: string) => {
    promptRepo.deletePrompt(db, id)
  })

  ipcMain.handle(IPC_CHANNELS.PROMPTS_INCREMENT_USE, (_event, id: string) => {
    promptRepo.incrementUseCount(db, id)
  })

  ipcMain.handle(IPC_CHANNELS.PROMPTS_SET_RATING, (_event, id: string, rating: number) => {
    promptRepo.setRating(db, id, rating)
  })

  ipcMain.handle(IPC_CHANNELS.PROMPT_COLLECTIONS_GET_ALL, () => {
    return promptRepo.getAllCollections(db)
  })

  ipcMain.handle(IPC_CHANNELS.PROMPT_COLLECTIONS_CREATE, (_event, data: PromptCollectionCreate) => {
    return promptRepo.insertCollection(db, data)
  })

  ipcMain.handle(
    IPC_CHANNELS.PROMPT_COLLECTIONS_UPDATE,
    (_event, id: string, data: Partial<PromptCollectionCreate>) => {
      return promptRepo.updateCollection(db, id, data) ?? null
    }
  )

  ipcMain.handle(IPC_CHANNELS.PROMPT_COLLECTIONS_DELETE, (_event, id: string) => {
    promptRepo.deleteCollection(db, id)
  })

  ipcMain.handle(IPC_CHANNELS.PROMPT_COLLECTIONS_REORDER, (_event, orderedIds: string[]) => {
    promptRepo.reorderCollections(db, orderedIds)
  })
}