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
  LIBRARY_GET_THUMBNAIL: 'library:getThumbnail',
  LIBRARY_GET_THUMBNAILS_BATCH: 'library:getThumbnailsBatch',

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
  TIMELINE_CLEAR_COMPLETED: 'timeline:clearCompleted',
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
  WINDOW_MAXIMIZED_CHANGED: 'app:windowMaximizedChanged',
  MODEL_DOWNLOAD_PROGRESS: 'model:download-progress'
} as const

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS]
