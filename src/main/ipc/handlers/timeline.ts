import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '../channels'
import { getDatabase } from '../../db/connection'
import * as generationRepo from '../../db/repositories/generations'
import * as generationInputRepo from '../../db/repositories/generation-inputs'

export function registerTimelineHandlers(): void {
  const db = getDatabase()

  ipcMain.handle(IPC_CHANNELS.TIMELINE_GET_ALL, () => {
    const generations = generationRepo.getAllGenerations(db)
    return { generations }
  })

  ipcMain.handle(IPC_CHANNELS.TIMELINE_GET, (_event, id: string) => {
    return generationRepo.getGenerationById(db, id)
  })

  ipcMain.handle(IPC_CHANNELS.TIMELINE_REMOVE, (_event, id: string) => {
    generationRepo.removeGeneration(db, id)
  })

  ipcMain.handle(IPC_CHANNELS.TIMELINE_CLEAR_COMPLETED, () => {
    // Get all completed generations and remove them
    const all = generationRepo.getAllGenerations(db)
    for (const gen of all) {
      if (gen.status === 'completed') {
        generationRepo.removeGeneration(db, gen.id)
      }
    }
  })

  ipcMain.handle(IPC_CHANNELS.TIMELINE_GET_THUMBNAIL, (_event, _genId: string) => {
    // TODO: Implement timeline thumbnail retrieval
    return null
  })

  ipcMain.handle(
    IPC_CHANNELS.TIMELINE_GET_THUMBNAILS_BATCH,
    (_event, _genIds: string[]) => {
      // TODO: Implement batch timeline thumbnail retrieval
      return {}
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.TIMELINE_GET_INPUT_THUMBNAIL,
    (_event, _inputId: string) => {
      // TODO: Implement input thumbnail retrieval
      return null
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.TIMELINE_GET_INPUT_THUMBNAILS_BATCH,
    (_event, _inputIds: string[]) => {
      // TODO: Implement batch input thumbnail retrieval
      return {}
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.TIMELINE_GET_GENERATION_INPUTS,
    (_event, genId: string) => {
      return generationInputRepo.getGenerationInputs(db, genId)
    }
  )
}
