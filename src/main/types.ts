// =============================================================================
// Distillery - Shared Type Definitions (Main Process)
// Re-exports from a single canonical location for both main and renderer.
// =============================================================================

// Media types
export type MediaType = 'image' | 'video'
export type MediaOriginKind = 'generation' | 'import'
export type MediaStatus = 'selected' | 'rejected' | null
export type MediaSortField = 'created_at' | 'rating' | 'file_name'

export interface NormalizedCropRect {
  x: number
  y: number
  w: number
  h: number
}

export interface ImageTransforms {
  rotation: 0 | 90 | 180 | 270
  flip_h: boolean
  flip_v: boolean
  crop: NormalizedCropRect | null
  aspect_ratio: string | null
}

export interface ImageAdjustments {
  exposure: number
  brightness: number
  contrast: number
  highlights: number
  shadows: number
  saturation: number
  vibrance: number
  temperature: number
  tint: number
  hue: number
  clarity: number
}

export interface VideoTrim {
  startTime: number
  endTime: number
}

export interface VideoEdits {
  version: 1
  trim?: VideoTrim
  timestamp?: string
}

export interface VideoMetadata {
  duration: number
  width: number
  height: number
  frameRate: number
}

export interface MediaRecord {
  id: string
  file_path: string
  thumb_path: string | null
  file_name: string
  media_type: MediaType
  origin: MediaOriginKind
  width: number | null
  height: number | null
  duration: number | null
  file_size: number | null
  rating: number
  status: MediaStatus
  generation_id: string | null
  origin_id: string | null
  active_upscale_id: string | null
  created_at: string
  updated_at: string
  /** Computed at IPC boundary — points to active upscale variant or null */
  working_file_path?: string | null
}

export interface MediaUpdate {
  rating?: number
  status?: MediaStatus
  file_name?: string
}

export interface MediaQuery {
  page?: number
  pageSize?: number
  rating?: number
  status?: MediaStatus | 'unmarked' | 'all'
  media_type?: MediaType
  modelIdentityId?: string
  sort?: MediaSortField
  sortDirection?: 'asc' | 'desc'
  search?: string
  collectionId?: string
}

export interface ModelFilterOption {
  id: string
  name: string
}

export interface MediaPage {
  items: MediaRecord[]
  total: number
  page: number
  pageSize: number
}

// Collection types
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

// Prompt library types
export interface PromptRecord {
  id: string
  title: string | null
  text: string
  rating: number
  use_count: number
  collection_id: string | null
  created_at: string
  updated_at: string
  last_used_at: string | null
}

export interface PromptCollectionRecord {
  id: string
  name: string
  parent_id: string | null
  sort_order: number
  created_at: string
  updated_at: string
  prompt_count?: number
}

export interface PromptCreate {
  text: string
  title?: string
  collection_id?: string
}

export interface PromptUpdate {
  text?: string
  title?: string
  rating?: number
  collection_id?: string | null
}

export interface PromptCollectionCreate {
  name: string
  parent_id?: string | null
}

// Import folder types
export type ImportFolderMode = 'reference' | 'copy' | 'move'

export interface ImportFolderRecord {
  id: string
  name: string
  path: string
  import_mode: ImportFolderMode
  recursive: boolean
  persist: boolean
  auto_import: boolean
  target_collection_id?: string
  initial_keywords?: string[]
  last_scanned?: string
  created_at: string
}

export type ImportFolderCreate = Omit<ImportFolderRecord, 'id' | 'last_scanned' | 'created_at'>

export type ImportFolderUpdate = Partial<Omit<ImportFolderRecord, 'id' | 'path' | 'created_at'>> & {
  id: string
}

export interface ImportScanProgress {
  folder_id: string
  folder_name: string
  files_found: number
  files_processed: number
  files_imported: number
  files_skipped: number
  files_errored: number
  status: 'scanning' | 'importing' | 'complete' | 'error'
  error?: string
}

// Generation types
export type GenerationMode = 'text-to-image' | 'image-to-image' | 'text-to-video' | 'image-to-video'
export type GenerationStatus = 'pending' | 'completed' | 'failed'
export type QueueStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled'

export interface GenerationRecord {
  id: string
  number: number
  model_identity_id: string | null
  canonical_model_id?: string | null
  canonical_model_name?: string | null
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
  output_paths: string | null
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
  preview_file_path?: string | null
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
  mode: GenerationMode
  params: CanonicalGenerationParams
}

export interface WorkItem {
  id: string
  task_type: string
  status: QueueStatus
  priority: number
  payload_json: string
  correlation_id: string | null
  owner_module: string
  error_message: string | null
  attempt_count: number
  max_attempts: number
  created_at: string
  started_at: string | null
  completed_at: string | null
}

export interface EnqueueWorkInput {
  task_type: string
  priority?: number
  payload_json: string
  correlation_id?: string
  owner_module: string
  max_attempts?: number
}

export type WorkResourceResolver = (item: WorkItem) => string[]

export interface WorkFilter {
  status?: QueueStatus
  task_type?: string
  owner_module?: string
}

export interface WorkTaskResult {
  success: boolean
  error?: string
}

export interface GenerationProgressEvent {
  generationId: string
  providerId: string
  phase: string
  step?: number
  totalSteps?: number
  message?: string
}

export interface CanonicalRequestSchema {
  properties: Record<string, CanonicalSchemaProperty>
  required?: string[]
  order?: string[]
}

export interface CanonicalSchemaProperty {
  type: 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'object'
  title?: string
  description?: string
  default?: unknown
  minimum?: number
  maximum?: number
  step?: number
  enum?: Array<string | number>
  items?: { type: string; minItems?: number; maxItems?: number }
  properties?: Record<string, CanonicalSchemaProperty>
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

// Engine types
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

export interface ModelQuantSelections {
  [modelId: string]: {
    diffusionQuant: string
    textEncoderQuant: string
  }
}

export interface EngineProgressEvent {
  jobId: string
  phase: string
  step?: number
  totalSteps?: number
  message?: string
}

export interface EngineResultEvent {
  jobId: string
  success: boolean
  outputPath?: string
  seed?: number
  totalTimeMs?: number
  promptCacheHit?: boolean
  refLatentCacheHit?: boolean
  error?: string
}

// Settings types
export type LocalGenerationBackend = 'cn-engine' | 'stable-diffusion.cpp'

export interface AppSettings {
  library_root: string
  engine_path: string
  sd_cpp_server_path: string
  model_base_path: string
  upscale_backend: UpscaleBackendPreference
  local_generation_backend: LocalGenerationBackend
  active_model_id: string
  model_quant_selections: ModelQuantSelections
  offload_to_cpu: boolean
  flash_attn: boolean
  vae_on_cpu: boolean
  llm_on_cpu: boolean
  sd_cpp_max_vram_gb: number | null
  confirm_before_delete: boolean
  left_panel_open: boolean
  left_panel_tab: string
  left_panel_width: number
  right_panel_open: boolean
  right_panel_tab: string
  right_panel_width: number
  thumbnail_size: number
  view_mode: 'grid' | 'loupe'
  fal_api_key: string
  replicate_api_key: string
  wavespeed_api_key: string
  gptproto_api_key: string
  kie_api_key: string
  venice_api_key: string
  ninjachat_api_key: string
  runware_api_key: string
  window_x?: number
  window_y?: number
  window_width?: number
  window_height?: number
  window_maximized?: boolean
}

export type SettingsKey = keyof AppSettings
export type SettingsUpdate = Partial<AppSettings>

export interface HardwareProfile {
  platform: NodeJS.Platform
  arch: string
  totalMemory: number
  gpuInfo?: string
}

// Upscale types
export type UpscaleBackend = 'onnx' | 'cn-engine'
export type UpscaleBackendPreference = 'auto' | UpscaleBackend

export interface UpscaleModelArtifactConfig {
  files: string[]
  tileSize?: number
}

export interface UpscaleModelConfig {
  id: string
  name: string
  description: string
  nativeScale: number
  supportedScales: number[]
  enabled: boolean
  backends: Partial<Record<UpscaleBackend, UpscaleModelArtifactConfig>>
}

export interface UpscaleModelInfo {
  id: string
  name: string
  description: string
  supportedScales: number[]
  available: boolean
  backend?: UpscaleBackend
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

// Removal types
export interface RemovalStroke {
  points: Array<{ x: number; y: number }>
  brushSizeNormalized: number
  erasing: boolean
}

export interface RemovalCache {
  sourceHash: string
  resultPath: string
  width: number
  height: number
  timestamp: string
}

export interface RemovalOperation {
  id: string
  strokes: RemovalStroke[]
  featherRadiusNormalized: number
  enabled: boolean
  timestamp: string
  cache: RemovalCache | null
}

export interface RemovalData {
  version: 1
  operations: RemovalOperation[]
}

export interface RemovalStateSnapshot {
  data: RemovalData | null
  staleOperationIds: string[]
}

export interface RemovalProgressEvent {
  mediaId: string
  operationId: string
  phase: 'preparing' | 'rasterizing' | 'inferring' | 'blending' | 'complete' | 'error'
  message?: string
}

export interface RemovalResultEvent {
  mediaId: string
  operationId: string
  success: boolean
  error?: string
}
