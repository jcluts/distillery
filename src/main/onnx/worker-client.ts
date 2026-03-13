import { Worker, type TransferListItem } from 'worker_threads'
import type { WorkerErrorResponse, WorkerRequestBase, WorkerResponseBase } from './worker-contract'

interface PendingRequest<TResponse extends WorkerResponseBase> {
  resolve: (value: TResponse) => void
  reject: (error: Error) => void
  isFinal: (response: TResponse) => boolean
  onResponse?: (response: TResponse) => void
}

type WithoutRequestId<TRequest extends WorkerRequestBase> = TRequest extends unknown
  ? Omit<TRequest, 'requestId'>
  : never

export class OnnxWorkerClient<
  TRequest extends WorkerRequestBase,
  TResponse extends WorkerResponseBase
> {
  private worker: Worker | null = null
  private nextRequestId = 1
  private pending = new Map<number, PendingRequest<TResponse>>()

  constructor(
    private readonly workerPath: string,
    private readonly label: string
  ) {}

  sendRequest(
    request: WithoutRequestId<TRequest>,
    options?: {
      isFinal?: (response: TResponse) => boolean
      onResponse?: (response: TResponse) => void
      transferList?: TransferListItem[]
    }
  ): Promise<TResponse> {
    const worker = this.ensureWorker()

    return new Promise<TResponse>((resolve, reject) => {
      const requestId = this.nextRequestId
      this.nextRequestId += 1

      this.pending.set(requestId, {
        resolve,
        reject,
        isFinal: options?.isFinal ?? ((response) => response.type !== 'progress'),
        onResponse: options?.onResponse
      })

      const payload = { ...request, requestId } as TRequest
      worker.postMessage(payload, options?.transferList ?? [])
    })
  }

  async dispose(): Promise<void> {
    if (!this.worker) {
      return
    }

    const worker = this.worker
    this.worker = null
    this.rejectAll(new Error(`${this.label} worker disposed`))
    await worker.terminate()
  }

  private ensureWorker(): Worker {
    if (this.worker) {
      return this.worker
    }

    this.worker = new Worker(this.workerPath)
    this.worker.on('message', (message) => {
      this.handleMessage(message as TResponse)
    })
    this.worker.on('error', (error) => {
      console.error(`[${this.label}] Worker error:`, error)
      this.handleWorkerFailure(new Error(`${this.label} worker crashed: ${error.message}`))
    })
    this.worker.on('exit', (code) => {
      if (code !== 0) {
        console.warn(`[${this.label}] Worker exited with code ${code}`)
        this.handleWorkerFailure(new Error(`${this.label} worker exited with code ${code}`))
      } else {
        this.worker = null
      }
    })

    return this.worker
  }

  private handleMessage(message: TResponse): void {
    const pending = this.pending.get(message.requestId)
    if (!pending) {
      return
    }

    if (message.type === 'error') {
      this.pending.delete(message.requestId)
      pending.reject(new Error((message as TResponse & WorkerErrorResponse).error))
      return
    }

    pending.onResponse?.(message)

    if (pending.isFinal(message)) {
      this.pending.delete(message.requestId)
      pending.resolve(message)
    }
  }

  private handleWorkerFailure(error: Error): void {
    this.worker = null
    this.rejectAll(error)
  }

  private rejectAll(error: Error): void {
    for (const pending of this.pending.values()) {
      pending.reject(error)
    }

    this.pending.clear()
  }
}