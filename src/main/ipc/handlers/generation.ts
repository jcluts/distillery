import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '../channels'
import type { GenerationParams, GenerationSubmitInput } from '../../types'
import type { GenerationService } from '../../generation/generation-service'

export function registerGenerationHandlers(generationService: GenerationService): void {
  ipcMain.handle(
    IPC_CHANNELS.GENERATION_SUBMIT,
    async (_event, params: GenerationSubmitInput | GenerationParams) => {
      return generationService.submit(params)
    }
  )

  ipcMain.handle(IPC_CHANNELS.GENERATION_CANCEL, async (_event, jobId: string) => {
    generationService.cancel(jobId)
  })

  ipcMain.handle(IPC_CHANNELS.GENERATION_LIST_ENDPOINTS, async () => {
    return generationService.listEndpoints({ outputType: 'image' })
  })

  ipcMain.handle(IPC_CHANNELS.GENERATION_GET_ENDPOINT_SCHEMA, async (_event, endpointKey: string) => {
    return generationService.getEndpointSchema(endpointKey)
  })
}
