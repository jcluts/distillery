// =============================================================================
// Distillery - Shared Type Definitions (Main Process)
// Re-exports from a single canonical location for both main and renderer.
// =============================================================================

// Media types
export type MediaType = 'image'
export type MediaOriginKind = 'generation' | 'import'
export type MediaStatus = 'selected' | 'rejected' | null
export type MediaSortField = 'created_at' | 'rating' | 'file_name'

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
  rating: number
  status: MediaStatus
  generation_id: string | null
  origin_id: string | null
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
  rating?: number
  status?: MediaStatus | 'unmarked' | 'all'
  media_type?: MediaType
  sort?: MediaSortField
  sortDirection?: 'asc' | 'desc'
  search?: string
  collectionId?: string
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

// Generation types
export type GenerationStatus = 'pending' | 'completed' | 'failed'
export type QueueStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled'

export interface GenerationRecord {
  id: string
  number: number
  base_model_id: string | null
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

export interface BaseModel {
  id: string
  name: string
  family: string
  media_type: MediaType
  created_at: string
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

export interface WorkFilter {
  status?: QueueStatus
  task_type?: string
  owner_module?: string
}

export interface WorkTaskResult {
  success: boolean
  error?: string
}

export interface GenerationOutputArtifact {
  providerPath: string
  mimeType?: string
}

export interface GenerationExecutionResult {
  generationId: string
  success: boolean
  outputs?: GenerationOutputArtifact[]
  metrics?: {
    seed?: number
    totalTimeMs?: number
    promptCacheHit?: boolean
    refLatentCacheHit?: boolean
  }
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
  canonicalModelId?: string
  displayName: string
  modes: Array<'text-to-image' | 'image-to-image' | 'text-to-video' | 'image-to-video'>
  outputType: 'image' | 'video'
  executionMode: 'queued-local' | 'remote-async'
  requestSchema: CanonicalRequestSchema
  uiSchema?: CanonicalUiSchema
}

export interface GenerationExecutionRequest {
  generationId: string
  endpoint: CanonicalEndpointDef
  params: CanonicalGenerationParams
  outputPath?: string
  preparedInputs?: {
    refImages: string[]
  }
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
export interface AppSettings {
  library_root: string
  engine_path: string
  model_base_path: string
  active_model_id: string
  model_quant_selections: ModelQuantSelections
  offload_to_cpu: boolean
  flash_attn: boolean
  vae_on_cpu: boolean
  llm_on_cpu: boolean
  confirm_before_delete: boolean
  left_panel_open: boolean
  left_panel_tab: string
  left_panel_width: number
  right_panel_open: boolean
  right_panel_tab: string
  right_panel_width: number
  thumbnail_size: number
  view_mode: 'grid' | 'loupe'
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
