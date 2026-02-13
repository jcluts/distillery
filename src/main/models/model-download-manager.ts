import { EventEmitter } from 'events'
import * as fs from 'fs'
import * as path from 'path'
import * as http from 'http'
import * as https from 'https'
import { URL } from 'url'
import type { DownloadProgressEvent, DownloadRequest } from './types'

interface QueueItem {
  request: DownloadRequest
  resolve: () => void
  reject: (error: Error) => void
}

export class ModelDownloadManager extends EventEmitter {
  private modelBasePath: string
  private readonly queue: QueueItem[] = []
  private readonly statuses = new Map<string, DownloadProgressEvent>()

  private activeRelativePath: string | null = null
  private activeClientRequest: http.ClientRequest | null = null
  private activeCancelled = false

  constructor(modelBasePath: string) {
    super()
    this.modelBasePath = modelBasePath
  }

  setModelBasePath(nextBasePath: string): void {
    this.modelBasePath = nextBasePath
  }

  getDownloadStatuses(): Record<string, DownloadProgressEvent> {
    const output: Record<string, DownloadProgressEvent> = {}
    for (const [relativePath, status] of this.statuses) {
      output[relativePath] = status
    }
    return output
  }

  enqueueDownload(request: DownloadRequest): Promise<void> {
    const canonicalRelativePath = this.canonicalizeRelativePath(request.destRelativePath)
    const existing = this.statuses.get(canonicalRelativePath)
    if (existing?.status === 'downloading' || existing?.status === 'queued') {
      return Promise.resolve()
    }

    if (existing?.status === 'completed') {
      return Promise.resolve()
    }

    this.emitProgress({
      relativePath: canonicalRelativePath,
      downloadedBytes: 0,
      totalBytes: request.expectedSize,
      status: 'queued'
    })

    return new Promise((resolve, reject) => {
      this.queue.push({ request, resolve, reject })
      this.processQueue()
    })
  }

  cancelDownload(relativePath: string): void {
    const canonicalRelativePath = this.canonicalizeRelativePath(relativePath)

    if (this.activeRelativePath === canonicalRelativePath) {
      this.activeCancelled = true
      this.activeClientRequest?.destroy(new Error('Download cancelled'))
      return
    }

    const queuedIndex = this.queue.findIndex(
      (item) =>
        this.canonicalizeRelativePath(item.request.destRelativePath) === canonicalRelativePath
    )
    if (queuedIndex >= 0) {
      const [item] = this.queue.splice(queuedIndex, 1)
      this.emitProgress({
        relativePath: canonicalRelativePath,
        downloadedBytes: 0,
        totalBytes: item.request.expectedSize,
        status: 'cancelled'
      })
      item.resolve()
    }
  }

  private processQueue(): void {
    if (this.activeRelativePath || this.queue.length === 0) {
      return
    }

    const item = this.queue.shift()
    if (!item) return

    void this.runDownload(item)
  }

  private async runDownload(item: QueueItem): Promise<void> {
    const { request } = item
    const relativePath = this.canonicalizeRelativePath(request.destRelativePath)
    const fsRelativePath = this.toFileSystemRelativePath(relativePath)
    const destination = path.join(this.modelBasePath, fsRelativePath)
    const partialPath = `${destination}.part`

    this.activeRelativePath = relativePath
    this.activeCancelled = false

    fs.mkdirSync(path.dirname(destination), { recursive: true })
    if (fs.existsSync(partialPath)) {
      fs.unlinkSync(partialPath)
    }

    try {
      let totalBytes = request.expectedSize
      let downloadedBytes = 0

      this.emitProgress({
        relativePath,
        downloadedBytes,
        totalBytes,
        status: 'downloading'
      })

      await this.streamToFile(request.url, partialPath, {
        onRequestCreated: (clientRequest) => {
          this.activeClientRequest = clientRequest
        },
        onResponseHeaders: (contentLength) => {
          if (contentLength > 0) {
            totalBytes = contentLength
            this.emitProgress({
              relativePath,
              downloadedBytes,
              totalBytes,
              status: 'downloading'
            })
          }
        },
        onData: (chunkLength) => {
          downloadedBytes += chunkLength
          this.emitProgress({
            relativePath,
            downloadedBytes,
            totalBytes,
            status: 'downloading'
          })
        }
      })

      if (this.activeCancelled) {
        this.safeDelete(partialPath)
        this.emitProgress({
          relativePath,
          downloadedBytes,
          totalBytes,
          status: 'cancelled'
        })
        item.resolve()
        return
      }

      fs.renameSync(partialPath, destination)

      this.emitProgress({
        relativePath,
        downloadedBytes,
        totalBytes,
        status: 'completed'
      })
      item.resolve()
    } catch (error) {
      this.safeDelete(partialPath)

      if (this.activeCancelled) {
        this.emitProgress({
          relativePath,
          downloadedBytes: 0,
          totalBytes: request.expectedSize,
          status: 'cancelled'
        })
        item.resolve()
      } else {
        const message = error instanceof Error ? error.message : String(error)
        this.emitProgress({
          relativePath,
          downloadedBytes: 0,
          totalBytes: request.expectedSize,
          status: 'failed',
          error: message
        })
        item.reject(error instanceof Error ? error : new Error(message))
      }
    } finally {
      this.activeRelativePath = null
      this.activeClientRequest = null
      this.activeCancelled = false
      this.processQueue()
    }
  }

  private canonicalizeRelativePath(relativePath: string): string {
    const slashNormalized = relativePath.replace(/\\+/g, '/')
    const posixNormalized = path.posix.normalize(slashNormalized)
    const trimmed = posixNormalized.replace(/^\.\//, '')

    if (trimmed.startsWith('..') || path.posix.isAbsolute(trimmed)) {
      throw new Error(`Invalid model relative path: ${relativePath}`)
    }

    return trimmed
  }

  private toFileSystemRelativePath(relativePath: string): string {
    return path.normalize(relativePath)
  }

  private safeDelete(filePath: string): void {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath)
      }
    } catch {
      // ignore cleanup errors
    }
  }

  private emitProgress(event: DownloadProgressEvent): void {
    this.statuses.set(event.relativePath, event)
    this.emit('progress', event)
  }

  private streamToFile(
    sourceUrl: string,
    destinationPath: string,
    hooks: {
      onRequestCreated: (request: http.ClientRequest) => void
      onResponseHeaders: (contentLength: number) => void
      onData: (chunkLength: number) => void
    }
  ): Promise<void> {
    const maxRedirects = 5

    const execute = (urlString: string, redirectsRemaining: number): Promise<void> => {
      return new Promise((resolve, reject) => {
        const { requestUrl, headers, isHuggingFace } = this.prepareRequest(urlString)
        const parsedUrl = new URL(requestUrl)
        const requestFn = parsedUrl.protocol === 'http:' ? http.request : https.request

        const req = requestFn(
          {
            protocol: parsedUrl.protocol,
            hostname: parsedUrl.hostname,
            port: parsedUrl.port,
            path: `${parsedUrl.pathname}${parsedUrl.search}`,
            method: 'GET',
            headers
          },
          (res) => {
            const statusCode = res.statusCode ?? 0

            if (statusCode >= 300 && statusCode < 400 && res.headers.location) {
              if (redirectsRemaining <= 0) {
                res.resume()
                reject(new Error('Too many redirects while downloading model file'))
                return
              }

              const nextUrl = new URL(res.headers.location, parsedUrl).toString()
              res.resume()
              resolve(execute(nextUrl, redirectsRemaining - 1))
              return
            }

            if (statusCode < 200 || statusCode >= 300) {
              const chunks: Buffer[] = []
              let size = 0
              const maxBytes = 4096

              res.on('data', (chunk: Buffer) => {
                if (size >= maxBytes) return
                const slice = chunk.subarray(0, maxBytes - size)
                chunks.push(slice)
                size += slice.length
              })

              res.on('end', () => {
                const bodyText = Buffer.concat(chunks).toString('utf8').replace(/\s+/g, ' ').trim()
                const bodySuffix = bodyText ? ` - ${bodyText.slice(0, 220)}` : ''
                const authSuffix =
                  isHuggingFace && statusCode === 401
                    ? ' (Hugging Face authorization required: accept model terms and/or configure HF_TOKEN)'
                    : ''
                reject(
                  new Error(`Download failed with status ${statusCode}${authSuffix}${bodySuffix}`)
                )
              })

              res.on('error', (error) => {
                reject(error)
              })

              return
            }

            const contentLength = Number(res.headers['content-length'] ?? 0)
            hooks.onResponseHeaders(Number.isFinite(contentLength) ? contentLength : 0)

            const out = fs.createWriteStream(destinationPath)
            res.on('data', (chunk: Buffer) => {
              hooks.onData(chunk.length)
            })

            res.on('error', (error) => {
              out.destroy()
              reject(error)
            })

            out.on('error', (error) => {
              reject(error)
            })

            out.on('finish', () => {
              resolve()
            })

            res.pipe(out)
          }
        )

        hooks.onRequestCreated(req)

        req.on('error', (error) => {
          reject(error)
        })

        req.end()
      })
    }

    return execute(sourceUrl, maxRedirects)
  }

  private prepareRequest(urlString: string): {
    requestUrl: string
    headers: Record<string, string>
    isHuggingFace: boolean
  } {
    const parsedUrl = new URL(urlString)
    const isHuggingFace = parsedUrl.hostname.endsWith('huggingface.co')

    if (
      isHuggingFace &&
      parsedUrl.pathname.includes('/resolve/') &&
      !parsedUrl.searchParams.has('download')
    ) {
      parsedUrl.searchParams.set('download', 'true')
    }

    const headers: Record<string, string> = {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Distillery/1.0',
      Accept: isHuggingFace ? 'application/octet-stream,*/*;q=0.9' : '*/*'
    }

    if (isHuggingFace) {
      headers.Referer = 'https://huggingface.co/'
      const token = process.env.HF_TOKEN || process.env.HUGGING_FACE_HUB_TOKEN
      if (token) {
        headers.Authorization = `Bearer ${token}`
      }
    }

    return {
      requestUrl: parsedUrl.toString(),
      headers,
      isHuggingFace
    }
  }
}
