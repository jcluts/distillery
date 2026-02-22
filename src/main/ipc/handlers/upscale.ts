import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '../channels'
import type { UpscaleService } from '../../upscale/upscale-service'
import type { UpscaleRequest } from '../../types'

export function registerUpscaleHandlers(upscaleService: UpscaleService): void {
  ipcMain.handle(IPC_CHANNELS.UPSCALE_GET_MODELS, () => {
    return upscaleService.getModels()
  })

  ipcMain.handle(IPC_CHANNELS.UPSCALE_SUBMIT, async (_event, request: UpscaleRequest) => {
    return upscaleService.submit(request)
  })

  ipcMain.handle(IPC_CHANNELS.UPSCALE_CANCEL, async (_event, mediaId: string) => {
    await upscaleService.cancel(mediaId)
  })

  ipcMain.handle(IPC_CHANNELS.UPSCALE_GET_DATA, (_event, mediaId: string) => {
    return upscaleService.getUpscaleData(mediaId)
  })

  ipcMain.handle(
    IPC_CHANNELS.UPSCALE_SET_ACTIVE,
    (_event, mediaId: string, variantId: string | null) => {
      upscaleService.setActiveVariant(mediaId, variantId)
    }
  )

  ipcMain.handle(IPC_CHANNELS.UPSCALE_DELETE_VARIANT, (_event, variantId: string) => {
    upscaleService.deleteVariant(variantId)
  })

  ipcMain.handle(IPC_CHANNELS.UPSCALE_DELETE_ALL, (_event, mediaId: string) => {
    upscaleService.deleteAllVariants(mediaId)
  })
}
