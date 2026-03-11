import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '../channels'
import type { UpscaleService } from '../../upscale/upscale-service'
import type { UpscaleRequest } from '../../types'

export function registerUpscaleHandlers(
  upscaleService: UpscaleService,
  options?: { onLibraryUpdated?: () => void }
): void {
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
    async (_event, mediaId: string, variantId: string | null) => {
      await upscaleService.setActiveVariant(mediaId, variantId)
      options?.onLibraryUpdated?.()
    }
  )

  ipcMain.handle(IPC_CHANNELS.UPSCALE_DELETE_VARIANT, async (_event, variantId: string) => {
    await upscaleService.deleteVariant(variantId)
    options?.onLibraryUpdated?.()
  })

  ipcMain.handle(IPC_CHANNELS.UPSCALE_DELETE_ALL, async (_event, mediaId: string) => {
    await upscaleService.deleteAllVariants(mediaId)
    options?.onLibraryUpdated?.()
  })
}
