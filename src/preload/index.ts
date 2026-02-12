import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// IPC Channel constants - must match src/main/ipc/channels.ts
const CH = {
  LIBRARY_GET_MEDIA: 'library:getMedia',
  LIBRARY_GET_MEDIA_BY_ID: 'library:getMediaById',
  LIBRARY_UPDATE_MEDIA: 'library:updateMedia',
  LIBRARY_DELETE_MEDIA: 'library:deleteMedia',
  LIBRARY_IMPORT_MEDIA: 'library:importMedia',
  LIBRARY_GET_THUMBNAIL: 'library:getThumbnail',
  LIBRARY_GET_THUMBNAILS_BATCH: 'library:getThumbnailsBatch',
  GENERATION_SUBMIT: 'generation:submit',
  GENERATION_CANCEL: 'generation:cancel',
  ENGINE_GET_STATUS: 'engine:getStatus',
  ENGINE_LOAD_MODEL: 'engine:loadModel',
  ENGINE_UNLOAD_MODEL: 'engine:unloadModel',
  QUEUE_GET: 'queue:get',
  TIMELINE_GET_ALL: 'timeline:getAll',
  TIMELINE_GET: 'timeline:get',
  TIMELINE_REMOVE: 'timeline:remove',
  TIMELINE_CLEAR_COMPLETED: 'timeline:clearCompleted',
  TIMELINE_GET_THUMBNAIL: 'timeline:getThumbnail',
  TIMELINE_GET_THUMBNAILS_BATCH: 'timeline:getThumbnailsBatch',
  TIMELINE_GET_INPUT_THUMBNAIL: 'timeline:getInputThumbnail',
  TIMELINE_GET_INPUT_THUMBNAILS_BATCH: 'timeline:getInputThumbnailsBatch',
  TIMELINE_GET_GENERATION_INPUTS: 'timeline:getGenerationInputs',
  SETTINGS_GET: 'settings:get',
  SETTINGS_SAVE: 'settings:save',
  APP_SHOW_OPEN_DIALOG: 'app:showOpenDialog',
  APP_SHOW_SAVE_DIALOG: 'app:showSaveDialog',
  APP_SHOW_ITEM_IN_FOLDER: 'app:showItemInFolder',
  APP_GET_HARDWARE_PROFILE: 'app:getHardwareProfile',
  // Events
  ENGINE_STATUS_CHANGED: 'engine:status',
  ENGINE_PROGRESS: 'engine:progress',
  ENGINE_RESULT: 'engine:result',
  QUEUE_UPDATED: 'queue:updated',
  LIBRARY_UPDATED: 'library:updated'
} as const

// Typed API for renderer
const api = {
  // Library
  getMedia: (params: unknown) => ipcRenderer.invoke(CH.LIBRARY_GET_MEDIA, params),
  getMediaById: (id: string) => ipcRenderer.invoke(CH.LIBRARY_GET_MEDIA_BY_ID, id),
  updateMedia: (id: string, updates: unknown) =>
    ipcRenderer.invoke(CH.LIBRARY_UPDATE_MEDIA, id, updates),
  deleteMedia: (ids: string[]) => ipcRenderer.invoke(CH.LIBRARY_DELETE_MEDIA, ids),
  importMedia: (filePaths: string[]) =>
    ipcRenderer.invoke(CH.LIBRARY_IMPORT_MEDIA, filePaths),
  getThumbnail: (id: string) => ipcRenderer.invoke(CH.LIBRARY_GET_THUMBNAIL, id),
  getThumbnailsBatch: (ids: string[]) =>
    ipcRenderer.invoke(CH.LIBRARY_GET_THUMBNAILS_BATCH, ids),

  // Generation
  submitGeneration: (params: unknown) =>
    ipcRenderer.invoke(CH.GENERATION_SUBMIT, params),
  cancelGeneration: (jobId: string) =>
    ipcRenderer.invoke(CH.GENERATION_CANCEL, jobId),

  // Engine
  getEngineStatus: () => ipcRenderer.invoke(CH.ENGINE_GET_STATUS),
  loadModel: (params: unknown) => ipcRenderer.invoke(CH.ENGINE_LOAD_MODEL, params),
  unloadModel: () => ipcRenderer.invoke(CH.ENGINE_UNLOAD_MODEL),

  // Queue
  getQueue: () => ipcRenderer.invoke(CH.QUEUE_GET),

  // Timeline
  timeline: {
    getAll: () => ipcRenderer.invoke(CH.TIMELINE_GET_ALL),
    get: (id: string) => ipcRenderer.invoke(CH.TIMELINE_GET, id),
    remove: (id: string) => ipcRenderer.invoke(CH.TIMELINE_REMOVE, id),
    clearCompleted: () => ipcRenderer.invoke(CH.TIMELINE_CLEAR_COMPLETED),
    getThumbnail: (genId: string) =>
      ipcRenderer.invoke(CH.TIMELINE_GET_THUMBNAIL, genId),
    getThumbnailsBatch: (genIds: string[]) =>
      ipcRenderer.invoke(CH.TIMELINE_GET_THUMBNAILS_BATCH, genIds),
    getInputThumbnail: (inputId: string) =>
      ipcRenderer.invoke(CH.TIMELINE_GET_INPUT_THUMBNAIL, inputId),
    getInputThumbnailsBatch: (inputIds: string[]) =>
      ipcRenderer.invoke(CH.TIMELINE_GET_INPUT_THUMBNAILS_BATCH, inputIds),
    getGenerationInputs: (genId: string) =>
      ipcRenderer.invoke(CH.TIMELINE_GET_GENERATION_INPUTS, genId)
  },

  // Settings
  getSettings: () => ipcRenderer.invoke(CH.SETTINGS_GET),
  saveSettings: (updates: unknown) => ipcRenderer.invoke(CH.SETTINGS_SAVE, updates),

  // App
  showOpenDialog: (options: unknown) =>
    ipcRenderer.invoke(CH.APP_SHOW_OPEN_DIALOG, options),
  showSaveDialog: (options: unknown) =>
    ipcRenderer.invoke(CH.APP_SHOW_SAVE_DIALOG, options),
  showItemInFolder: (path: string) =>
    ipcRenderer.invoke(CH.APP_SHOW_ITEM_IN_FOLDER, path),
  getHardwareProfile: () => ipcRenderer.invoke(CH.APP_GET_HARDWARE_PROFILE),

  // Event subscriptions (returns unsubscribe function)
  on: (channel: string, callback: (...args: unknown[]) => void): (() => void) => {
    const validChannels = [
      CH.ENGINE_STATUS_CHANGED,
      CH.ENGINE_PROGRESS,
      CH.ENGINE_RESULT,
      CH.QUEUE_UPDATED,
      CH.LIBRARY_UPDATED
    ]

    if (!validChannels.includes(channel as typeof validChannels[number])) {
      console.warn(`[preload] Unknown event channel: ${channel}`)
      return () => {}
    }

    const handler = (_event: Electron.IpcRendererEvent, ...args: unknown[]): void => {
      callback(...args)
    }

    ipcRenderer.on(channel, handler)
    return () => ipcRenderer.removeListener(channel, handler)
  }
}

// Expose APIs via contextBridge
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
