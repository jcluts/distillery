// =============================================================================
// IPC Channel Name Constants
// Single source of truth for all IPC communication channel names.
// =============================================================================

export const IPC_CHANNELS = {
  // Library
  LIBRARY_GET_MEDIA: 'library:getMedia',
  LIBRARY_GET_MEDIA_BY_ID: 'library:getMediaById',
  LIBRARY_UPDATE_MEDIA: 'library:updateMedia',
  LIBRARY_DELETE_MEDIA: 'library:deleteMedia',
  LIBRARY_IMPORT_MEDIA: 'library:importMedia',
  LIBRARY_SHOW_IN_FOLDER: 'library:showInFolder',
  LIBRARY_OPEN_IN_APP: 'library:openInApp',
  LIBRARY_COPY_TO_CLIPBOARD: 'library:copyToClipboard',
  LIBRARY_GET_THUMBNAIL: 'library:getThumbnail',
  LIBRARY_GET_THUMBNAILS_BATCH: 'library:getThumbnailsBatch',

  // Keywords
  KEYWORDS_GET_FOR_MEDIA: 'keywords:getForMedia',
  KEYWORDS_SET_FOR_MEDIA: 'keywords:setForMedia',
  KEYWORDS_ADD_TO_MEDIA: 'keywords:addToMedia',
  KEYWORDS_REMOVE_FROM_MEDIA: 'keywords:removeFromMedia',
  KEYWORDS_SEARCH: 'keywords:search',
  KEYWORDS_GET_ALL: 'keywords:getAll',

  // Collections
  COLLECTIONS_GET_ALL: 'collections:getAll',
  COLLECTIONS_GET: 'collections:get',
  COLLECTIONS_CREATE: 'collections:create',
  COLLECTIONS_UPDATE: 'collections:update',
  COLLECTIONS_DELETE: 'collections:delete',
  COLLECTIONS_REORDER: 'collections:reorder',
  COLLECTIONS_ADD_MEDIA: 'collections:addMedia',
  COLLECTIONS_REMOVE_MEDIA: 'collections:removeMedia',

  // Import Folders
  IMPORT_FOLDERS_GET_ALL: 'importFolders:getAll',
  IMPORT_FOLDERS_CREATE: 'importFolders:create',
  IMPORT_FOLDERS_UPDATE: 'importFolders:update',
  IMPORT_FOLDERS_DELETE: 'importFolders:delete',
  IMPORT_FOLDERS_SCAN: 'importFolders:scan',
  IMPORT_FOLDERS_START: 'importFolders:start',

  // Generation
  GENERATION_SUBMIT: 'generation:submit',
  GENERATION_CANCEL: 'generation:cancel',
  GENERATION_LIST_ENDPOINTS: 'generation:listEndpoints',
  GENERATION_GET_ENDPOINT_SCHEMA: 'generation:getEndpointSchema',

  // Engine
  ENGINE_GET_STATUS: 'engine:getStatus',
  ENGINE_LOAD_MODEL: 'engine:loadModel',
  ENGINE_UNLOAD_MODEL: 'engine:unloadModel',

  // Queue
  QUEUE_GET: 'queue:get',

  // Timeline
  TIMELINE_GET_ALL: 'timeline:getAll',
  TIMELINE_GET: 'timeline:get',
  TIMELINE_REMOVE: 'timeline:remove',
  TIMELINE_CLEAR_FAILED: 'timeline:clearFailed',
  TIMELINE_GET_THUMBNAIL: 'timeline:getThumbnail',
  TIMELINE_GET_THUMBNAILS_BATCH: 'timeline:getThumbnailsBatch',
  TIMELINE_GET_INPUT_THUMBNAIL: 'timeline:getInputThumbnail',
  TIMELINE_GET_INPUT_THUMBNAILS_BATCH: 'timeline:getInputThumbnailsBatch',
  TIMELINE_GET_GENERATION_INPUTS: 'timeline:getGenerationInputs',

  // Settings
  SETTINGS_GET: 'settings:get',
  SETTINGS_SAVE: 'settings:save',

  // Models
  MODEL_GET_CATALOG: 'model:get-catalog',
  MODEL_GET_DOWNLOAD_STATUS: 'model:get-download-status',
  MODEL_DOWNLOAD_FILE: 'model:download-file',
  MODEL_CANCEL_DOWNLOAD: 'model:cancel-download',
  MODEL_REMOVE_FILE: 'model:remove-file',
  MODEL_CHECK_FILES: 'model:check-files',

  // Providers
  PROVIDERS_GET_ALL: 'providers:getAll',
  PROVIDERS_GET_CONFIG: 'providers:getConfig',
  PROVIDERS_SEARCH_MODELS: 'providers:searchModels',
  PROVIDERS_LIST_MODELS: 'providers:listModels',
  PROVIDERS_FETCH_MODEL_DETAIL: 'providers:fetchModelDetail',
  PROVIDERS_GET_USER_MODELS: 'providers:getUserModels',
  PROVIDERS_ADD_USER_MODEL: 'providers:addUserModel',
  PROVIDERS_REMOVE_USER_MODEL: 'providers:removeUserModel',
  PROVIDERS_TEST_CONNECTION: 'providers:testConnection',

  // Model Identities
  IDENTITIES_GET_ALL: 'identities:getAll',
  IDENTITIES_CREATE: 'identities:create',
  IDENTITIES_ADD_MAPPING: 'identities:addMapping',

  // Upscale
  UPSCALE_GET_MODELS: 'upscale:getModels',
  UPSCALE_SUBMIT: 'upscale:submit',
  UPSCALE_CANCEL: 'upscale:cancel',
  UPSCALE_GET_DATA: 'upscale:getData',
  UPSCALE_SET_ACTIVE: 'upscale:setActive',
  UPSCALE_DELETE_VARIANT: 'upscale:deleteVariant',
  UPSCALE_DELETE_ALL: 'upscale:deleteAll',

  // App
  APP_SHOW_OPEN_DIALOG: 'app:showOpenDialog',
  APP_SHOW_SAVE_DIALOG: 'app:showSaveDialog',
  APP_SHOW_ITEM_IN_FOLDER: 'app:showItemInFolder',
  APP_GET_HARDWARE_PROFILE: 'app:getHardwareProfile',

  // Window controls (renderer -> main)
  APP_WINDOW_MINIMIZE: 'app:windowMinimize',
  APP_WINDOW_TOGGLE_MAXIMIZE: 'app:windowToggleMaximize',
  APP_WINDOW_CLOSE: 'app:windowClose',
  APP_WINDOW_IS_MAXIMIZED: 'app:windowIsMaximized',

  // Events (main -> renderer)
  ENGINE_STATUS_CHANGED: 'engine:status',
  GENERATION_PROGRESS: 'generation:progress',
  GENERATION_RESULT: 'generation:result',
  QUEUE_UPDATED: 'queue:updated',
  LIBRARY_UPDATED: 'library:updated',
  COLLECTIONS_UPDATED: 'collections:updated',
  IMPORT_FOLDERS_UPDATED: 'importFolders:updated',
  IMPORT_SCAN_PROGRESS: 'importFolders:scanProgress',
  WINDOW_MAXIMIZED_CHANGED: 'app:windowMaximizedChanged',
  MODEL_DOWNLOAD_PROGRESS: 'model:download-progress',
  UPSCALE_PROGRESS: 'upscale:progress',
  UPSCALE_RESULT: 'upscale:result'
} as const

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS]
