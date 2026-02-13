import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '../channels'
import { EngineManager } from '../../engine/engine-manager'
import type { ModelLoadParams } from '../../types'

export function registerEngineHandlers(engineManager: EngineManager): void {
  ipcMain.handle(IPC_CHANNELS.ENGINE_GET_STATUS, () => {
    return engineManager.getStatus()
  })

  ipcMain.handle(
    IPC_CHANNELS.ENGINE_LOAD_MODEL,
    async (_event, params: ModelLoadParams) => {
      await engineManager.loadModel(params)
    }
  )

  ipcMain.handle(IPC_CHANNELS.ENGINE_UNLOAD_MODEL, async () => {
    await engineManager.unloadModel()
  })
}
