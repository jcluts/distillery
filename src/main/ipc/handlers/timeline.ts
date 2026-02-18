import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '../channels'
import { getDatabase } from '../../db/connection'
import * as generationRepo from '../../db/repositories/generations'
import * as generationInputRepo from '../../db/repositories/generation-inputs'
import * as mediaRepo from '../../db/repositories/media'

function toLibraryUrl(relativePath: string): string {
  const normalized = relativePath.replace(/\\/g, '/').replace(/^\/+/, '')
  const encoded = normalized
    .split('/')
    .filter(Boolean)
    .map((seg) => encodeURIComponent(seg))
    .join('/')
  return `distillery://library/${encoded}`
}

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
    const media = mediaRepo.getMediaByGenerationId(db, _genId)
    if (!media?.thumb_path) return null
    return toLibraryUrl(media.thumb_path)
  })

  ipcMain.handle(
    IPC_CHANNELS.TIMELINE_GET_THUMBNAILS_BATCH,
    (_event, _genIds: string[]) => {
      const result: Record<string, string> = {}
      for (const genId of _genIds) {
        const media = mediaRepo.getMediaByGenerationId(db, genId)
        if (media?.thumb_path) {
          result[genId] = toLibraryUrl(media.thumb_path)
        }
      }
      return result
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.TIMELINE_GET_INPUT_THUMBNAIL,
    (_event, _inputId: string) => {
      const input = generationInputRepo.getGenerationInputById(db, _inputId)
      if (!input) return null
      return toLibraryUrl(input.thumb_path)
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.TIMELINE_GET_INPUT_THUMBNAILS_BATCH,
    (_event, _inputIds: string[]) => {
      const result: Record<string, string> = {}
      for (const inputId of _inputIds) {
        const input = generationInputRepo.getGenerationInputById(db, inputId)
        if (input) {
          result[inputId] = toLibraryUrl(input.thumb_path)
        }
      }
      return result
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.TIMELINE_GET_GENERATION_INPUTS,
    (_event, genId: string) => {
      const inputs = generationInputRepo.getGenerationInputs(db, genId)
      return inputs.map((i) => ({
        ...i,
        thumb_path: toLibraryUrl(i.thumb_path)
        // ref_cache_path is intentionally left as a raw relative path.
        // It is an internal main-process implementation detail used only by
        // the generation pipeline.  The renderer does not need it and must
        // not pass it back as a ref_image_path.
      }))
    }
  )
}
