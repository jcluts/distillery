export interface WorkerRequestBase {
  requestId: number
  type: string
}

export interface WorkerResponseBase {
  requestId: number
  type: string
}

export interface WorkerErrorResponse extends WorkerResponseBase {
  type: 'error'
  error: string
}