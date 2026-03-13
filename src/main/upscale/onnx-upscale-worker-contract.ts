import type { WorkerErrorResponse, WorkerRequestBase, WorkerResponseBase } from '../onnx/worker-contract'

export type InitMessage = WorkerRequestBase & {
  type: 'init'
  modelPath: string
}

export type UpscaleMessage = WorkerRequestBase & {
  type: 'upscale'
  imageData: Float32Array
  width: number
  height: number
  scale: number
  tileSize: number
}

export interface ReadyMessage extends WorkerResponseBase {
  type: 'ready'
}

export interface ProgressMessage extends WorkerResponseBase {
  type: 'progress'
  completedTiles: number
  totalTiles: number
  message?: string
}

export interface ResultMessage extends WorkerResponseBase {
  type: 'result'
  data: Float32Array
  width: number
  height: number
}

export type WorkerMessage = InitMessage | UpscaleMessage
export type WorkerResponse = ReadyMessage | ProgressMessage | ResultMessage | WorkerErrorResponse