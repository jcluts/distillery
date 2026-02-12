import { ipcMain, BrowserWindow } from 'electron'

import { IPC_CHANNELS } from '../channels'

function getWindow(getMainWindow: () => BrowserWindow | null): BrowserWindow | null {
  return getMainWindow() ?? BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0] ?? null
}

export function registerWindowHandlers(getMainWindow: () => BrowserWindow | null): void {
  ipcMain.handle(IPC_CHANNELS.APP_WINDOW_MINIMIZE, () => {
    getWindow(getMainWindow)?.minimize()
  })

  ipcMain.handle(IPC_CHANNELS.APP_WINDOW_TOGGLE_MAXIMIZE, () => {
    const win = getWindow(getMainWindow)
    if (!win) return
    if (win.isMaximized()) win.unmaximize()
    else win.maximize()
  })

  ipcMain.handle(IPC_CHANNELS.APP_WINDOW_CLOSE, () => {
    getWindow(getMainWindow)?.close()
  })

  ipcMain.handle(IPC_CHANNELS.APP_WINDOW_IS_MAXIMIZED, () => {
    return getWindow(getMainWindow)?.isMaximized() ?? false
  })
}
