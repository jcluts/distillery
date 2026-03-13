import type { MediaRecord, UpscaleBackend, UpscaleModelConfig } from '../types'

export interface UpscaleExecutionProgress {
  step?: number
  totalSteps?: number
  message?: string
}

export interface UpscaleExecutionArgs {
  media: MediaRecord
  modelId: string
  scaleFactor: number
  variantId: string
  inputAbsPath: string
  outputAbsPath: string
  onProgress?: (progress: UpscaleExecutionProgress) => void
}

export interface BackendUpscaleExecuteArgs {
  inputAbsPath: string
  outputAbsPath: string
  modelPath: string
  nativeScale: number
  scaleFactor: number
  variantId: string
  mediaWidth?: number | null
  mediaHeight?: number | null
  tileSize?: number
  onProgress?: (progress: UpscaleExecutionProgress) => void
}

export interface BackendUpscaleResult {
  width: number
  height: number
  totalTimeMs?: number
}

export interface UpscaleExecutionResult extends BackendUpscaleResult {
  backend: UpscaleBackend
  modelConfig: UpscaleModelConfig
}