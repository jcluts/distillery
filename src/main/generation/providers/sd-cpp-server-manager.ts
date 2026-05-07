import { spawn, type ChildProcess } from 'child_process'
import http from 'http'
import net from 'net'
import * as path from 'path'

export interface SdCppServerConfig {
  serverPath: string
  diffusionModel: string
  vae: string
  llm: string
  offloadToCpu: boolean
  flashAttention: boolean
  vaeOnCpu: boolean
}

export interface SdCppServerProgress {
  step: number
  totalSteps: number
}

export class SdCppServerManager {
  private process: ChildProcess | null = null
  private baseUrl: string | null = null
  private activeConfigKey: string | null = null
  private stopping = false
  private startPromise: Promise<string> | null = null
  private readonly progressListeners = new Set<(progress: SdCppServerProgress) => void>()

  onProgress(listener: (progress: SdCppServerProgress) => void): () => void {
    this.progressListeners.add(listener)
    return () => this.progressListeners.delete(listener)
  }

  async ensureRunning(config: SdCppServerConfig): Promise<string> {
    const configKey = this.buildConfigKey(config)

    if (this.process && this.baseUrl && this.activeConfigKey === configKey) {
      return this.baseUrl
    }

    if (this.startPromise) {
      await this.startPromise
      if (this.process && this.baseUrl && this.activeConfigKey === configKey) {
        return this.baseUrl
      }
    }

    this.startPromise = this.start(config, configKey)
    try {
      return await this.startPromise
    } finally {
      this.startPromise = null
    }
  }

  async stop(): Promise<void> {
    const proc = this.process
    this.process = null
    this.baseUrl = null
    this.activeConfigKey = null

    if (!proc) return

    this.stopping = true
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        try {
          proc.kill('SIGKILL')
        } catch {
          // Process may already be gone.
        }
        resolve()
      }, 2000)

      proc.once('exit', () => {
        clearTimeout(timeout)
        resolve()
      })

      try {
        proc.kill('SIGTERM')
      } catch {
        clearTimeout(timeout)
        resolve()
      }
    })
    this.stopping = false
  }

  private async start(config: SdCppServerConfig, configKey: string): Promise<string> {
    await this.stop()

    const port = await getFreePort()
    const baseUrl = `http://127.0.0.1:${port}`
    const serverDir = path.dirname(config.serverPath)

    const args = [
      '--diffusion-model',
      config.diffusionModel,
      '--vae',
      config.vae,
      '--llm',
      config.llm,
      '--listen-ip',
      '127.0.0.1',
      '--listen-port',
      String(port),
      '--cfg-scale',
      '1.0',
      '-v'
    ]

    if (config.offloadToCpu) args.push('--offload-to-cpu')
    if (config.flashAttention) args.push('--diffusion-fa')
    if (config.vaeOnCpu) args.push('--vae-on-cpu')

    this.process = spawn(config.serverPath, args, {
      cwd: serverDir,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      env: {
        ...process.env,
        DYLD_LIBRARY_PATH: [serverDir, process.env.DYLD_LIBRARY_PATH].filter(Boolean).join(':'),
        PATH: [serverDir, process.env.PATH].filter(Boolean).join(path.delimiter)
      }
    })

    this.process.stdout?.on('data', (data: Buffer) => {
      this.handleProgressOutput(data)
      const text = data.toString().trim()
      if (text) console.log(`[sd-cpp:stdout] ${text}`)
    })

    this.process.stderr?.on('data', (data: Buffer) => {
      this.handleProgressOutput(data)
      const text = data.toString().trim()
      if (text) console.log(`[sd-cpp:stderr] ${text}`)
    })

    this.process.once('exit', (code, signal) => {
      console.log(`[SdCppServerManager] sd-server exited: code=${code}, signal=${signal}`)
      if (!this.stopping) {
        this.process = null
        this.baseUrl = null
        this.activeConfigKey = null
      }
    })

    this.process.once('error', (error) => {
      console.error('[SdCppServerManager] sd-server process error:', error)
    })

    try {
      await this.waitUntilReady(baseUrl)
    } catch (error) {
      await this.stop()
      throw error
    }

    this.baseUrl = baseUrl
    this.activeConfigKey = configKey
    return baseUrl
  }

  private async waitUntilReady(baseUrl: string): Promise<void> {
    const deadline = Date.now() + 300_000
    let lastError: unknown = null

    while (Date.now() < deadline) {
      if (!this.process) {
        throw new Error('stable-diffusion.cpp server exited before becoming ready')
      }

      try {
        await requestJson(`${baseUrl}/sdcpp/v1/capabilities`, { method: 'GET', timeoutMs: 5000 })
        return
      } catch (error) {
        lastError = error
        await delay(1000)
      }
    }

    throw new Error(
      `stable-diffusion.cpp server did not become ready within 300s: ${
        lastError instanceof Error ? lastError.message : String(lastError)
      }`
    )
  }

  private buildConfigKey(config: SdCppServerConfig): string {
    return JSON.stringify(config)
  }

  private handleProgressOutput(data: Buffer): void {
    if (this.progressListeners.size === 0) return

    const text = data.toString()
    const matches = Array.from(text.matchAll(/(?:^|[^\d])(\d+)\/(\d+)(?:[^\d]|$)/g))
    const latest = matches[matches.length - 1]
    if (!latest) return

    const step = Number(latest[1])
    const totalSteps = Number(latest[2])
    if (!Number.isFinite(step) || !Number.isFinite(totalSteps)) return
    if (step < 0 || totalSteps <= 0 || step > totalSteps) return

    for (const listener of this.progressListeners) {
      listener({ step, totalSteps })
    }
  }
}

export async function requestJson<T = unknown>(
  url: string,
  options: { method: 'GET' | 'POST'; body?: unknown; timeoutMs?: number }
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const parsed = new URL(url)
    const body = options.body === undefined ? undefined : JSON.stringify(options.body)

    const req = http.request(
      {
        hostname: parsed.hostname,
        port: parsed.port,
        path: `${parsed.pathname}${parsed.search}`,
        method: options.method,
        timeout: options.timeoutMs ?? 600_000,
        headers: {
          ...(body
            ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
            : {})
        }
      },
      (res) => {
        const chunks: Buffer[] = []
        res.on('data', (chunk: Buffer) => chunks.push(chunk))
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8')
          if ((res.statusCode ?? 500) >= 400) {
            reject(new Error(`HTTP ${res.statusCode}: ${text}`))
            return
          }

          try {
            resolve((text ? JSON.parse(text) : null) as T)
          } catch (error) {
            reject(error)
          }
        })
      }
    )

    req.on('timeout', () => {
      req.destroy(new Error(`Request timed out after ${options.timeoutMs ?? 600_000}ms`))
    })
    req.on('error', reject)

    if (body) req.write(body)
    req.end()
  })
}

function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      server.close(() => {
        if (address && typeof address === 'object') {
          resolve(address.port)
        } else {
          reject(new Error('Unable to allocate a local port'))
        }
      })
    })
    server.on('error', reject)
  })
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
