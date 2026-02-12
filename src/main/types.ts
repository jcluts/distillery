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
  keywords: string | null
  generation_id: string | null
  origin_id: string | null
  created_at: string
  updated_at: string
}

export interface MediaUpdate {
  rating?: number
  status?: MediaStatus
  keywords?: string
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
}

export interface MediaPage {
  items: MediaRecord[]
  total: number
  page: number
  pageSize: number
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
  created_at: string
}

export interface GenerationParams {
  prompt: string
  width: number
  height: number
  seed?: number
  steps?: number
  guidance?: number
  sampling_method?: string
  ref_image_ids?: string[]
  ref_image_paths?: string[]
}

export interface BaseModel {
  id: string
  name: string
  family: string
  media_type: MediaType
  created_at: string
}

export interface QueueItem {
  id: string
  generation_id: string
  status: QueueStatus
  priority: number
  error_message: string | null
  created_at: string
  started_at: string | null
  completed_at: string | null
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
  diffusion_model_path: string
  vae_path: string
  llm_path: string
  offload_to_cpu: boolean
  flash_attn: boolean
  vae_on_cpu: boolean
  llm_on_cpu: boolean
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
