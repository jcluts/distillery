export interface InitMessage {
  type: 'init'
  modelPath: string
}

export interface InferMessage {
  type: 'infer'
  imageBuffer: Uint8Array
  maskBuffer: Uint8Array
  width: number
  height: number
}

export interface ReadyMessage {
  type: 'ready'
}

export interface ResultMessage {
  type: 'result'
  outputBuffer: Uint8Array
}

export interface ErrorMessage {
  type: 'error'
  error: string
}

export type WorkerMessage = InitMessage | InferMessage
export type WorkerResponse = ReadyMessage | ResultMessage | ErrorMessage