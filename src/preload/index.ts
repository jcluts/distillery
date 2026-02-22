import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import { IPC_CHANNELS } from '../main/ipc/channels'
import type {
  CollectionCreate,
  CollectionUpdate,
  DistilleryAPI,
  GenerationSubmitInput,
  MediaQuery,
  MediaUpdate,
  ModelLoadParams,
  SettingsUpdate,
  UpscaleRequest
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
  importMedia: (filePaths: string[]) => ipcRenderer.invoke(CH.LIBRARY_IMPORT_MEDIA, filePaths),
  getThumbnail: (id: string) => ipcRenderer.invoke(CH.LIBRARY_GET_THUMBNAIL, id),
  getThumbnailsBatch: (ids: string[]) => ipcRenderer.invoke(CH.LIBRARY_GET_THUMBNAILS_BATCH, ids),
  showMediaInFolder: (id: string) => ipcRenderer.invoke(CH.LIBRARY_SHOW_IN_FOLDER, id),
  openMediaInApp: (id: string) => ipcRenderer.invoke(CH.LIBRARY_OPEN_IN_APP, id),
  copyMediaToClipboard: (id: string) => ipcRenderer.invoke(CH.LIBRARY_COPY_TO_CLIPBOARD, id),

  // Keywords
  keywords: {
    getForMedia: (mediaId: string) => ipcRenderer.invoke(CH.KEYWORDS_GET_FOR_MEDIA, mediaId),
    setForMedia: (mediaId: string, keywords: string[]) =>
      ipcRenderer.invoke(CH.KEYWORDS_SET_FOR_MEDIA, mediaId, keywords),
    addToMedia: (mediaId: string, keyword: string) =>
      ipcRenderer.invoke(CH.KEYWORDS_ADD_TO_MEDIA, mediaId, keyword),
    removeFromMedia: (mediaId: string, keyword: string) =>
      ipcRenderer.invoke(CH.KEYWORDS_REMOVE_FROM_MEDIA, mediaId, keyword),
    search: (prefix: string, limit?: number) =>
      ipcRenderer.invoke(CH.KEYWORDS_SEARCH, prefix, limit),
    getAll: () => ipcRenderer.invoke(CH.KEYWORDS_GET_ALL)
  },

  // Collections
  collections: {
    getAll: () => ipcRenderer.invoke(CH.COLLECTIONS_GET_ALL),
    get: (id: string) => ipcRenderer.invoke(CH.COLLECTIONS_GET, id),
    create: (data: CollectionCreate) => ipcRenderer.invoke(CH.COLLECTIONS_CREATE, data),
    update: (id: string, data: CollectionUpdate) =>
      ipcRenderer.invoke(CH.COLLECTIONS_UPDATE, id, data),
    delete: (id: string) => ipcRenderer.invoke(CH.COLLECTIONS_DELETE, id),
    reorder: (orderedIds: string[]) => ipcRenderer.invoke(CH.COLLECTIONS_REORDER, orderedIds),
    addMedia: (collectionId: string, mediaIds: string[]) =>
      ipcRenderer.invoke(CH.COLLECTIONS_ADD_MEDIA, collectionId, mediaIds),
    removeMedia: (collectionId: string, mediaIds: string[]) =>
      ipcRenderer.invoke(CH.COLLECTIONS_REMOVE_MEDIA, collectionId, mediaIds)
  },

  // Generation
  submitGeneration: (params: GenerationSubmitInput) =>
    ipcRenderer.invoke(CH.GENERATION_SUBMIT, params),
  cancelGeneration: (jobId: string) => ipcRenderer.invoke(CH.GENERATION_CANCEL, jobId),
  listGenerationEndpoints: () => ipcRenderer.invoke(CH.GENERATION_LIST_ENDPOINTS),
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
    clearFailed: () => ipcRenderer.invoke(CH.TIMELINE_CLEAR_FAILED),
    getThumbnail: (genId: string) => ipcRenderer.invoke(CH.TIMELINE_GET_THUMBNAIL, genId),
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

  // Models
  getModelCatalog: () => ipcRenderer.invoke(CH.MODEL_GET_CATALOG),
  getModelDownloadStatus: () => ipcRenderer.invoke(CH.MODEL_GET_DOWNLOAD_STATUS),
  downloadModelFile: (payload) => ipcRenderer.invoke(CH.MODEL_DOWNLOAD_FILE, payload),
  cancelModelDownload: (payload) => ipcRenderer.invoke(CH.MODEL_CANCEL_DOWNLOAD, payload),
  removeModelFile: (payload) => ipcRenderer.invoke(CH.MODEL_REMOVE_FILE, payload),
  checkModelFiles: (payload) => ipcRenderer.invoke(CH.MODEL_CHECK_FILES, payload),

  // Providers
  providers: {
    getAll: () => ipcRenderer.invoke(CH.PROVIDERS_GET_ALL),
    getConfig: (providerId: string) => ipcRenderer.invoke(CH.PROVIDERS_GET_CONFIG, providerId),
    searchModels: (providerId: string, query: string) =>
      ipcRenderer.invoke(CH.PROVIDERS_SEARCH_MODELS, providerId, query),
    listModels: (providerId: string) => ipcRenderer.invoke(CH.PROVIDERS_LIST_MODELS, providerId),
    fetchModelDetail: (providerId: string, modelId: string) =>
      ipcRenderer.invoke(CH.PROVIDERS_FETCH_MODEL_DETAIL, providerId, modelId),
    getUserModels: (providerId: string) =>
      ipcRenderer.invoke(CH.PROVIDERS_GET_USER_MODELS, providerId),
    addUserModel: (providerId: string, model) =>
      ipcRenderer.invoke(CH.PROVIDERS_ADD_USER_MODEL, providerId, model),
    removeUserModel: (providerId: string, modelId: string) =>
      ipcRenderer.invoke(CH.PROVIDERS_REMOVE_USER_MODEL, providerId, modelId),
    testConnection: (providerId: string) =>
      ipcRenderer.invoke(CH.PROVIDERS_TEST_CONNECTION, providerId)
  },

  // Upscale
  upscale: {
    getModels: () => ipcRenderer.invoke(CH.UPSCALE_GET_MODELS),
    submit: (request: UpscaleRequest) => ipcRenderer.invoke(CH.UPSCALE_SUBMIT, request),
    cancel: (mediaId: string) => ipcRenderer.invoke(CH.UPSCALE_CANCEL, mediaId),
    getData: (mediaId: string) => ipcRenderer.invoke(CH.UPSCALE_GET_DATA, mediaId),
    setActive: (mediaId: string, variantId: string | null) =>
      ipcRenderer.invoke(CH.UPSCALE_SET_ACTIVE, mediaId, variantId),
    deleteVariant: (variantId: string) => ipcRenderer.invoke(CH.UPSCALE_DELETE_VARIANT, variantId),
    deleteAll: (mediaId: string) => ipcRenderer.invoke(CH.UPSCALE_DELETE_ALL, mediaId)
  },

  // Model Identities
  identities: {
    getAll: () => ipcRenderer.invoke(CH.IDENTITIES_GET_ALL),
    create: (
      id: string,
      name: string,
      description: string,
      initialMapping?: { providerId: string; modelIds: string[] }
    ) => ipcRenderer.invoke(CH.IDENTITIES_CREATE, id, name, description, initialMapping),
    addMapping: (identityId: string, providerId: string, modelIds: string[]) =>
      ipcRenderer.invoke(CH.IDENTITIES_ADD_MAPPING, identityId, providerId, modelIds)
  },

  // App
  showOpenDialog: (options: Electron.OpenDialogOptions) =>
    ipcRenderer.invoke(CH.APP_SHOW_OPEN_DIALOG, options),
  showSaveDialog: (options: Electron.SaveDialogOptions) =>
    ipcRenderer.invoke(CH.APP_SHOW_SAVE_DIALOG, options),
  showItemInFolder: (path: string) => ipcRenderer.invoke(CH.APP_SHOW_ITEM_IN_FOLDER, path),
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
      | typeof CH.GENERATION_PROGRESS
      | typeof CH.GENERATION_RESULT
      | typeof CH.QUEUE_UPDATED
      | typeof CH.LIBRARY_UPDATED
      | typeof CH.COLLECTIONS_UPDATED
      | typeof CH.WINDOW_MAXIMIZED_CHANGED
      | typeof CH.MODEL_DOWNLOAD_PROGRESS
      | typeof CH.UPSCALE_PROGRESS
      | typeof CH.UPSCALE_RESULT

    const validChannels = new Set<EventChannel>([
      CH.ENGINE_STATUS_CHANGED,
      CH.GENERATION_PROGRESS,
      CH.GENERATION_RESULT,
      CH.QUEUE_UPDATED,
      CH.LIBRARY_UPDATED,
      CH.COLLECTIONS_UPDATED,
      CH.WINDOW_MAXIMIZED_CHANGED,
      CH.MODEL_DOWNLOAD_PROGRESS,
      CH.UPSCALE_PROGRESS,
      CH.UPSCALE_RESULT
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
