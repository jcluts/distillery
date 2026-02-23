// =============================================================================
// Distillery - Shared Type Definitions
// =============================================================================

// -----------------------------------------------------------------------------
// Media
// -----------------------------------------------------------------------------

export type MediaType = 'image' // future: | 'video'

export type MediaOriginKind = 'generation' | 'import' // future: | 'duplicate' | 'sketch'

export type MediaStatus = 'selected' | 'rejected' | null

export interface MediaRecord {
  id: string
  file_path: string
  thumb_path: string | null
  file_name: string
  media_type: MediaType
  origin: MediaOriginKind
  width: number | null
  height: number | null
  file_size: number | null
  rating: number // 0-5
  status: MediaStatus
  generation_id: string | null
  origin_id: string | null
  active_upscale_id: string | null
  working_file_path: string | null
  created_at: string
  updated_at: string
}

export interface MediaUpdate {
  rating?: number
  status?: MediaStatus
  file_name?: string
}

export interface MediaQuery {
  page?: number
  pageSize?: number
  rating?: number // minimum rating
  status?: MediaStatus | 'unmarked' | 'all'
  media_type?: MediaType
  sort?: MediaSortField
  sortDirection?: 'asc' | 'desc'
  search?: string
  collectionId?: string
}

export type MediaSortField = 'created_at' | 'rating' | 'file_name'

export interface MediaPage {
  items: MediaRecord[]
  total: number
  page: number
  pageSize: number
}

// -----------------------------------------------------------------------------
// Collections
// -----------------------------------------------------------------------------

export type CollectionType = 'manual' | 'special' | 'live'

export interface CollectionRecord {
  id: string
  name: string
  color: string
  type: CollectionType
  system_key: string | null
  sort_order: number
  filter_json: string | null
  created_at: string
  updated_at: string
  media_count: number
}

export interface CollectionCreate {
  name: string
  color: string
  media_ids?: string[]
}

export interface CollectionUpdate {
  name?: string
  color?: string
}

// -----------------------------------------------------------------------------
// Generation
// -----------------------------------------------------------------------------

export type GenerationMode = 'text-to-image' | 'image-to-image' | 'text-to-video' | 'image-to-video'

export type GenerationStatus = 'pending' | 'completed' | 'failed'

export interface GenerationRecord {
  id: string
  number: number
  model_identity_id: string | null
  provider: string
  model_file: string | null
  prompt: string | null
  width: number | null
  height: number | null
  seed: number | null
  steps: number | null
  guidance: number | null
  sampling_method: string | null
  params_json: string | null
  status: GenerationStatus
  error: string | null
  total_time_ms: number | null
  prompt_cache_hit: boolean
  ref_latent_cache_hit: boolean
  output_paths: string | null // JSON array
  created_at: string
  started_at: string | null
  completed_at: string | null
}

export interface GenerationInput {
  id: string
  generation_id: string
  media_id: string | null
  position: number
  source_type: 'library' | 'external'
  original_path: string | null
  original_filename: string | null
  thumb_path: string
  ref_cache_path: string | null
  created_at: string
}

export interface CanonicalGenerationParams {
  prompt: string
  width: number
  height: number
  seed?: number
  steps?: number
  guidance?: number
  sampling_method?: string
  ref_image_ids?: string[]
  ref_image_paths?: string[]
  [key: string]: unknown
}

export interface GenerationSubmitInput {
  endpointKey: string
  params: CanonicalGenerationParams
}

// -----------------------------------------------------------------------------
// Queue
// -----------------------------------------------------------------------------

export type QueueStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled'

export interface WorkQueueItem {
  id: string
  task_type: string
  status: QueueStatus
  priority: number
  correlation_id: string | null
  owner_module: string
  error_message: string | null
  attempt_count: number
  max_attempts: number
  created_at: string
  started_at: string | null
  completed_at: string | null
}

export interface CanonicalRequestSchema {
  properties: Record<string, CanonicalSchemaProperty>
  required?: string[]
  order?: string[]
}

export interface CanonicalSchemaProperty {
  type: 'string' | 'number' | 'integer' | 'boolean' | 'array'
  title?: string
  description?: string
  default?: unknown
  minimum?: number
  maximum?: number
  step?: number
  enum?: Array<string | number>
  items?: { type: string; minItems?: number; maxItems?: number }
  ui?: {
    component?: string
    placeholder?: string
    hidden?: boolean
    hideLabel?: boolean
    transformMap?: Record<string, unknown>
  }
}

export interface CanonicalUiSchema {
  groups?: Array<{ id: string; label: string; order?: number }>
  controls?: Record<string, { group?: string; order?: number; graphical?: boolean }>
}

export interface CanonicalEndpointDef {
  endpointKey: string
  providerId: string
  providerModelId: string
  modelIdentityId?: string
  displayName: string
  modes: GenerationMode[]
  outputType: 'image' | 'video'
  executionMode: 'queued-local' | 'remote-async'
  requestSchema: CanonicalRequestSchema
  uiSchema?: CanonicalUiSchema
}

export interface GenerationProgressEvent {
  generationId: string
  providerId: string
  phase: string
  step?: number
  totalSteps?: number
  message?: string
}

export interface GenerationResultEvent {
  generationId: string
  success: boolean
  outputs?: Array<{
    providerPath: string
    mimeType?: string
  }>
  metrics?: {
    seed?: number
    totalTimeMs?: number
    promptCacheHit?: boolean
    refLatentCacheHit?: boolean
  }
  error?: string
}

export interface ProviderConfig {
  providerId: string
  displayName?: string
  enabled?: boolean
  executionMode?: 'queued-local' | 'remote-async'
  adapter?: 'wavespeed' | 'fal' | 'replicate'
  feedFile?: string
  endpoints?: Array<{
    endpointKey: string
    providerModelId: string
    canonicalModelId?: string // preserved for provider config JSON compatibility
    modelIdentityId?: string
    displayName: string
    modes: GenerationMode[]
    outputType: 'image' | 'video'
    executionMode: 'queued-local' | 'remote-async'
    requestSchema: unknown
    uiSchema?: unknown
  }>
  baseUrl?: string
  auth?: {
    type: 'bearer' | 'key'
    header?: string
    prefix?: string
    settingsKey: keyof AppSettings
  }
  search?: {
    endpoint: string
    method: 'GET' | 'QUERY'
    queryParam?: string
    limitParam?: string
    extraParams?: Record<string, string>
    maxResults?: number
    detailEndpoint?: string
    detailQueryParam?: string
    searchOnly?: boolean
  }
  browse?: {
    mode: 'search' | 'list'
  }
  upload?: {
    endpoint: string
    method: 'multipart' | 'json'
    fileField?: string
    responseField: string
  }
  async?: {
    enabled: boolean
    requestIdPath: string
    pollEndpoint: string
    pollUrlPath?: string
    pollInterval?: number
    maxPollTime?: number
    statusPath: string
    completedValue: string
    failedValue: string
    errorPath?: string
    outputsPath: string
  }
  request?: {
    endpointTemplate?: string
  }
}

export interface SearchResult {
  models: SearchResultModel[]
  hasMore?: boolean
}

export interface SearchResultModel {
  modelId: string
  name: string
  description?: string
  type?: GenerationMode
  runCount?: number
  raw?: unknown
}

export interface ProviderModel {
  modelId: string
  name: string
  description?: string
  type?: GenerationMode
  providerId: string
  requestSchema: CanonicalRequestSchema
  modelIdentityId?: string
}

export interface ModelIdentity {
  id: string
  name: string
  description?: string
  providerMapping: Record<string, string[]>
}

// -----------------------------------------------------------------------------
// Engine
// -----------------------------------------------------------------------------

export type EngineState = 'stopped' | 'starting' | 'idle' | 'loading' | 'ready' | 'error'

export interface EngineStatus {
  state: EngineState
  modelName?: string
  error?: string
}

export interface ModelLoadParams {
  diffusion_model: string
  vae: string
  llm: string
  offload_to_cpu?: boolean
  flash_attn?: boolean
  vae_on_cpu?: boolean
  llm_on_cpu?: boolean
}

export type ModelType = 'image-generation'

export interface ModelCatalog {
  catalogVersion: number
  models: ModelDefinition[]
}

export interface ModelDefinition {
  id: string
  name: string
  description: string
  type: ModelType
  family: string
  vae: ModelFileRef
  diffusion: QuantCollection
  textEncoder: QuantCollection
}

export interface ModelFileRef {
  file: string
  size: number
  downloadUrl: string
}

export interface QuantVariant {
  id: string
  label: string
  description: string
  file: string
  size: number
  downloadUrl: string
}

export interface QuantCollection {
  quants: QuantVariant[]
}

export interface ModelQuantSelections {
  [modelId: string]: {
    diffusionQuant: string
    textEncoderQuant: string
  }
}

export type ModelComponent = 'vae' | 'diffusion' | 'textEncoder'

export type ModelDownloadStatus = 'queued' | 'downloading' | 'completed' | 'failed' | 'cancelled'

export interface DownloadProgressEvent {
  relativePath: string
  downloadedBytes: number
  totalBytes: number
  status: ModelDownloadStatus
  error?: string
}

export interface ModelFileCheckStatus {
  relativePath: string
  exists: boolean
}

export interface ModelFilesCheckResult {
  modelId: string
  isReady: boolean
  files: ModelFileCheckStatus[]
}

// -----------------------------------------------------------------------------
// Settings
// -----------------------------------------------------------------------------

export interface AppSettings {
  // Paths
  library_root: string
  engine_path: string
  model_base_path: string
  active_model_id: string
  model_quant_selections: ModelQuantSelections

  // Engine flags
  offload_to_cpu: boolean
  flash_attn: boolean
  vae_on_cpu: boolean
  llm_on_cpu: boolean

  // Behavior
  confirm_before_delete: boolean

  // UI state
  left_panel_open: boolean
  left_panel_tab: string
  left_panel_width: number
  right_panel_open: boolean
  right_panel_tab: string
  right_panel_width: number
  thumbnail_size: number
  view_mode: 'grid' | 'loupe'

  // API Provider Keys
  fal_api_key: string
  replicate_api_key: string
  wavespeed_api_key: string

  // Window
  window_x?: number
  window_y?: number
  window_width?: number
  window_height?: number
  window_maximized?: boolean
}

export type SettingsKey = keyof AppSettings

// Partial settings for saves
export type SettingsUpdate = Partial<AppSettings>

// -----------------------------------------------------------------------------
// Hardware
// -----------------------------------------------------------------------------

export interface HardwareProfile {
  platform: NodeJS.Platform
  arch: string
  totalMemory: number
  gpuInfo?: string
}

// -----------------------------------------------------------------------------
// Upscale
// -----------------------------------------------------------------------------

export interface UpscaleModelInfo {
  id: string
  name: string
  description: string
  supportedScales: number[]
  available: boolean
}

export interface UpscaleVariant {
  id: string
  media_id: string
  file_path: string
  model_id: string
  model_name: string
  scale_factor: number
  width: number
  height: number
  file_size: number | null
  created_at: string
}

export interface UpscaleRequest {
  mediaId: string
  modelId: string
  scaleFactor: number
}

export interface UpscaleProgressEvent {
  mediaId: string
  phase: 'preparing' | 'upscaling' | 'saving' | 'complete' | 'error'
  step?: number
  totalSteps?: number
  message?: string
}

export interface UpscaleResultEvent {
  mediaId: string
  success: boolean
  variant?: UpscaleVariant
  totalTimeMs?: number
  error?: string
}

// -----------------------------------------------------------------------------
// IPC API (exposed via contextBridge)
// -----------------------------------------------------------------------------

export interface DistilleryAPI {
  // Library
  getMedia(params: MediaQuery): Promise<MediaPage>
  getMediaById(id: string): Promise<MediaRecord | null>
  updateMedia(id: string, updates: MediaUpdate): Promise<void>
  deleteMedia(ids: string[]): Promise<void>
  importMedia(filePaths: string[]): Promise<MediaRecord[]>
  getThumbnail(id: string): Promise<string | null>
  getThumbnailsBatch(ids: string[]): Promise<Record<string, string>>
  showMediaInFolder(id: string): Promise<void>
  openMediaInApp(id: string): Promise<void>
  copyMediaToClipboard(id: string): Promise<void>

  // Keywords
  keywords: {
    getForMedia(mediaId: string): Promise<string[]>
    setForMedia(mediaId: string, keywords: string[]): Promise<void>
    addToMedia(mediaId: string, keyword: string): Promise<void>
    removeFromMedia(mediaId: string, keyword: string): Promise<void>
    search(prefix: string, limit?: number): Promise<string[]>
    getAll(): Promise<{ keyword: string; count: number }[]>
  }

  // Collections
  collections: {
    getAll(): Promise<CollectionRecord[]>
    get(id: string): Promise<CollectionRecord | null>
    create(data: CollectionCreate): Promise<CollectionRecord>
    update(id: string, data: CollectionUpdate): Promise<void>
    delete(id: string): Promise<void>
    reorder(orderedIds: string[]): Promise<void>
    addMedia(collectionId: string, mediaIds: string[]): Promise<void>
    removeMedia(collectionId: string, mediaIds: string[]): Promise<void>
  }

  // Generation
  submitGeneration(params: GenerationSubmitInput): Promise<string>
  cancelGeneration(jobId: string): Promise<void>
  listGenerationEndpoints(): Promise<CanonicalEndpointDef[]>
  getGenerationEndpointSchema(endpointKey: string): Promise<CanonicalEndpointDef | null>

  // Engine
  getEngineStatus(): Promise<EngineStatus>
  loadModel(params: ModelLoadParams): Promise<void>
  unloadModel(): Promise<void>

  // Queue
  getQueue(): Promise<WorkQueueItem[]>

  // Timeline
  timeline: {
    getAll(): Promise<{ generations: GenerationRecord[] }>
    get(id: string): Promise<GenerationRecord | null>
    remove(id: string): Promise<void>
    clearFailed(): Promise<void>
    getThumbnail(genId: string): Promise<string | null>
    getThumbnailsBatch(genIds: string[]): Promise<Record<string, string>>
    getInputThumbnail(inputId: string): Promise<string | null>
    getInputThumbnailsBatch(inputIds: string[]): Promise<Record<string, string>>
    getGenerationInputs(genId: string): Promise<GenerationInput[]>
  }

  // Settings
  getSettings(): Promise<AppSettings>
  saveSettings(settings: SettingsUpdate): Promise<void>

  // Models
  getModelCatalog(): Promise<ModelCatalog>
  getModelDownloadStatus(): Promise<Record<string, DownloadProgressEvent>>
  downloadModelFile(payload: {
    modelId: string
    component: ModelComponent
    quantId?: string
  }): Promise<void>
  cancelModelDownload(payload: { relativePath: string }): Promise<void>
  removeModelFile(payload: { relativePath: string }): Promise<void>
  checkModelFiles(payload: { modelId: string }): Promise<ModelFilesCheckResult>

  // Providers
  providers: {
    getAll(): Promise<ProviderConfig[]>
    getConfig(providerId: string): Promise<ProviderConfig | null>
    searchModels(providerId: string, query: string): Promise<SearchResult>
    listModels(providerId: string): Promise<ProviderModel[]>
    fetchModelDetail(providerId: string, modelId: string): Promise<ProviderModel | null>
    getUserModels(providerId: string): Promise<ProviderModel[]>
    addUserModel(providerId: string, model: ProviderModel): Promise<void>
    removeUserModel(providerId: string, modelId: string): Promise<void>
    testConnection(providerId: string): Promise<{ valid: boolean; error?: string }>
  }

  // Model Identities
  identities: {
    getAll(): Promise<ModelIdentity[]>
    create(
      id: string,
      name: string,
      description: string,
      initialMapping?: { providerId: string; modelIds: string[] }
    ): Promise<ModelIdentity>
    addMapping(identityId: string, providerId: string, modelIds: string[]): Promise<void>
  }

  // Upscale
  upscale: {
    getModels(): Promise<UpscaleModelInfo[]>
    submit(request: UpscaleRequest): Promise<string>
    cancel(mediaId: string): Promise<void>
    getData(mediaId: string): Promise<{ variants: UpscaleVariant[]; activeVariantId: string | null }>
    setActive(mediaId: string, variantId: string | null): Promise<void>
    deleteVariant(variantId: string): Promise<void>
    deleteAll(mediaId: string): Promise<void>
  }

  // App
  showOpenDialog(options: Electron.OpenDialogOptions): Promise<string[] | null>
  showSaveDialog(options: Electron.SaveDialogOptions): Promise<string | null>
  showItemInFolder(path: string): Promise<void>
  getHardwareProfile(): Promise<HardwareProfile>

  // Window controls
  windowMinimize(): Promise<void>
  windowToggleMaximize(): Promise<void>
  windowClose(): Promise<void>
  windowIsMaximized(): Promise<boolean>

  // Events
  on(channel: string, callback: (...args: unknown[]) => void): () => void
}
