import type { WorkerErrorResponse, WorkerRequestBase, WorkerResponseBase } from '../onnx/worker-contract'

export interface ReadyMessage extends WorkerResponseBase {
  type: 'ready'
}

export interface ResultMessage extends WorkerResponseBase {
  type: 'result'
  outputBuffer: Uint8Array
}

export type InitMessage = WorkerRequestBase & {
  type: 'init'
  modelPath: string
}

export type InferMessage = WorkerRequestBase & {
  type: 'infer'
  imageBuffer: Uint8Array
  maskBuffer: Uint8Array
  width: number
  height: number
}

export type WorkerMessage = InitMessage | InferMessage
export type WorkerResponse = ReadyMessage | ResultMessage | WorkerErrorResponse