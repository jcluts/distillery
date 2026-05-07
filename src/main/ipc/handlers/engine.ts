import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '../channels'
import type { EngineManager } from '../../engine/engine-manager'
import type { EngineStatus, ModelLoadParams } from '../../types'

const DISABLED_STATUS: EngineStatus = {
  state: 'stopped'
}

function getEngineManager(engineManager: EngineManager | null | undefined): EngineManager {
  if (!engineManager) {
    throw new Error(
      'cn-engine is disabled. Set DISTILLERY_ENABLE_CN_ENGINE=1 before launch to enable it.'
    )
  }

  return engineManager
}

export function registerEngineHandlers(engineManager?: EngineManager | null): void {
  ipcMain.handle(IPC_CHANNELS.ENGINE_GET_STATUS, () => {
    return engineManager?.getStatus() ?? DISABLED_STATUS
  })

  ipcMain.handle(IPC_CHANNELS.ENGINE_LOAD_MODEL, async (_event, params: ModelLoadParams) => {
    await getEngineManager(engineManager).loadModel(params)
  })

  ipcMain.handle(IPC_CHANNELS.ENGINE_UNLOAD_MODEL, async () => {
    await getEngineManager(engineManager).unloadModel()
  })
}
