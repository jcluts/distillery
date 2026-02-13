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

export interface DownloadRequest {
  url: string
  destRelativePath: string
  expectedSize: number
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

export interface ModelQuantSelectionUpdate {
  modelId: string
  diffusionQuant?: string
  textEncoderQuant?: string
}
