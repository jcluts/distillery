import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import { IPC_CHANNELS } from '../main/ipc/channels'
import type {
  DistilleryAPI,
  GenerationSubmitInput,
  MediaQuery,
  MediaUpdate,
  ModelLoadParams,
  SettingsUpdate
} from '../renderer/types'

const CH = IPC_CHANNELS

// Typed API for renderer
const api: DistilleryAPI = {
  // Library
  getMedia: (params: MediaQuery) => ipcRenderer.invoke(CH.LIBRARY_GET_MEDIA, params),
  getMediaById: (id: string) => ipcRenderer.invoke(CH.LIBRARY_GET_MEDIA_BY_ID, id),
  updateMedia: (id: string, updates: MediaUpdate) =>
    ipcRenderer.invoke(CH.LIBRARY_UPDATE_MEDIA, id, updates),
  deleteMedia: (ids: string[]) => ipcRenderer.invoke(CH.LIBRARY_DELETE_MEDIA, ids),
  importMedia: (filePaths: string[]) =>
    ipcRenderer.invoke(CH.LIBRARY_IMPORT_MEDIA, filePaths),
  getThumbnail: (id: string) => ipcRenderer.invoke(CH.LIBRARY_GET_THUMBNAIL, id),
  getThumbnailsBatch: (ids: string[]) =>
    ipcRenderer.invoke(CH.LIBRARY_GET_THUMBNAILS_BATCH, ids),

  // Generation
  submitGeneration: (params: GenerationSubmitInput) =>
    ipcRenderer.invoke(CH.GENERATION_SUBMIT, params),
  cancelGeneration: (jobId: string) =>
    ipcRenderer.invoke(CH.GENERATION_CANCEL, jobId),
  listGenerationEndpoints: () =>
    ipcRenderer.invoke(CH.GENERATION_LIST_ENDPOINTS),
  getGenerationEndpointSchema: (endpointKey: string) =>
    ipcRenderer.invoke(CH.GENERATION_GET_ENDPOINT_SCHEMA, endpointKey),

  // Engine
  getEngineStatus: () => ipcRenderer.invoke(CH.ENGINE_GET_STATUS),
  loadModel: (params: ModelLoadParams) => ipcRenderer.invoke(CH.ENGINE_LOAD_MODEL, params),
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
  saveSettings: (updates: SettingsUpdate) => ipcRenderer.invoke(CH.SETTINGS_SAVE, updates),

  // App
  showOpenDialog: (options: Electron.OpenDialogOptions) =>
    ipcRenderer.invoke(CH.APP_SHOW_OPEN_DIALOG, options),
  showSaveDialog: (options: Electron.SaveDialogOptions) =>
    ipcRenderer.invoke(CH.APP_SHOW_SAVE_DIALOG, options),
  showItemInFolder: (path: string) =>
    ipcRenderer.invoke(CH.APP_SHOW_ITEM_IN_FOLDER, path),
  getHardwareProfile: () => ipcRenderer.invoke(CH.APP_GET_HARDWARE_PROFILE),

  // Window controls
  windowMinimize: () => ipcRenderer.invoke(CH.APP_WINDOW_MINIMIZE),
  windowToggleMaximize: () => ipcRenderer.invoke(CH.APP_WINDOW_TOGGLE_MAXIMIZE),
  windowClose: () => ipcRenderer.invoke(CH.APP_WINDOW_CLOSE),
  windowIsMaximized: () => ipcRenderer.invoke(CH.APP_WINDOW_IS_MAXIMIZED),

  // Event subscriptions (returns unsubscribe function)
  on: (channel: string, callback: (...args: unknown[]) => void): (() => void) => {
    type EventChannel =
      | typeof CH.ENGINE_STATUS_CHANGED
      | typeof CH.ENGINE_PROGRESS
      | typeof CH.ENGINE_RESULT
      | typeof CH.GENERATION_PROGRESS
      | typeof CH.GENERATION_RESULT
      | typeof CH.QUEUE_UPDATED
      | typeof CH.LIBRARY_UPDATED
      | typeof CH.WINDOW_MAXIMIZED_CHANGED

    const validChannels = new Set<EventChannel>([
      CH.ENGINE_STATUS_CHANGED,
      CH.ENGINE_PROGRESS,
      CH.ENGINE_RESULT,
      CH.GENERATION_PROGRESS,
      CH.GENERATION_RESULT,
      CH.QUEUE_UPDATED,
      CH.LIBRARY_UPDATED,
      CH.WINDOW_MAXIMIZED_CHANGED
    ])

    if (!validChannels.has(channel as EventChannel)) {
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
