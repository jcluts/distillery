import { spawn, ChildProcess } from 'child_process'
import { EventEmitter } from 'events'
import { v4 as uuidv4 } from 'uuid'
import { EngineProtocol } from './engine-protocol'
import type { EngineCommand, EngineResponse } from './engine-protocol'
import type {
  EngineState,
  EngineStatus,
  ModelLoadParams,
  EngineProgressEvent,
  EngineResultEvent
} from '../types'

// =============================================================================
// Engine Manager
// Spawns and manages the cn-engine child process lifecycle.
// =============================================================================

export class EngineManager extends EventEmitter {
  private process: ChildProcess | null = null
  private protocol: EngineProtocol
  private state: EngineState = 'stopped'
  private loadedModelName: string | null = null
  private lastError: string | null = null
  private enginePath: string
  private restartAttempts = 0
  private maxRestartAttempts = 3

  constructor(enginePath: string) {
    super()
    this.enginePath = enginePath
    this.protocol = new EngineProtocol()

    // Forward progress events
    this.protocol.on('progress', (response: EngineResponse) => {
      const data = response.data ?? (response as any)
      const progressEvent: EngineProgressEvent = {
        jobId: response.id,
        phase: (data?.phase as string) ?? 'unknown',
        step: data?.step as number | undefined,
        totalSteps: (data?.total_steps as number | undefined) ??
          (data?.totalSteps as number | undefined),
        message: data?.message as string | undefined
      }
      this.emit('progress', progressEvent)
    })
  }

  /**
   * Get the current engine status.
   */
  getStatus(): EngineStatus {
    return {
      state: this.state,
      modelName: this.loadedModelName ?? undefined,
      error: this.lastError ?? undefined
    }
  }

  /**
   * Update the engine binary path.
   */
  setEnginePath(path: string): void {
    this.enginePath = path
  }

  /**
   * Spawn the cn-engine process and perform a health check.
   */
  async start(): Promise<void> {
    if (this.process) {
      console.warn('[EngineManager] Engine already running')
      return
    }

    if (!this.enginePath) {
      this.setState('error', 'Engine path not configured')
      return
    }

    this.setState('starting')

    try {
      this.process = spawn(this.enginePath, [], {
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true
      })

      this.process.on('exit', (code, signal) => {
        console.log(
          `[EngineManager] Engine exited: code=${code}, signal=${signal}`
        )
        this.process = null
        this.protocol.detach()

        if (this.state !== 'stopped') {
          // Unexpected exit
          this.setState('error', `Engine exited unexpectedly (code: ${code})`)
          this.attemptRestart()
        }
      })

      this.process.on('error', (err) => {
        console.error('[EngineManager] Engine process error:', err)
        this.setState('error', err.message)
      })

      // Attach protocol to process
      this.protocol.attach(this.process)

      // Health check via ping
      const pingId = `ping-${uuidv4()}`
      const response = await this.protocol.sendCommand({
        cmd: 'ping',
        id: pingId
      })

      if (response.type === 'ok' && response.data?.status === 'pong') {
        this.setState('idle')
        this.restartAttempts = 0
        console.log('[EngineManager] Engine started and healthy')
      } else {
        throw new Error('Unexpected ping response')
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error('[EngineManager] Failed to start engine:', message)
      this.setState('error', message)
      this.cleanup()
    }
  }

  /**
   * Load a model into the engine.
   */
  async loadModel(params: ModelLoadParams): Promise<void> {
    if (this.state !== 'idle' && this.state !== 'ready') {
      throw new Error(`Cannot load model in state: ${this.state}`)
    }

    this.setState('loading')

    try {
      const loadId = `load-${uuidv4()}`
      const command: EngineCommand = {
        cmd: 'load',
        id: loadId,
        params: {
          diffusion_model: params.diffusion_model,
          vae: params.vae,
          llm: params.llm,
          offload_to_cpu: params.offload_to_cpu ?? true,
          flash_attn: params.flash_attn ?? true,
          vae_on_cpu: params.vae_on_cpu ?? false,
          llm_on_cpu: params.llm_on_cpu ?? false,
          vae_decode_only: false,
          free_params_immediately: false
        }
      }

      const response = await this.protocol.sendCommand(
        command,
        EngineProtocol.LOAD_TIMEOUT
      )

      if (response.type === 'ok') {
        // Extract model name from the diffusion model path
        const modelName = params.diffusion_model.split(/[/\\]/).pop() ?? 'Unknown'
        this.loadedModelName = modelName
        this.setState('ready')
        console.log(
          `[EngineManager] Model loaded: ${modelName} (${response.data?.load_time_ms ?? '?'}ms)`
        )
      } else {
        throw new Error(response.error ?? 'Failed to load model')
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      this.setState('error', message)
      throw err
    }
  }

  /**
   * Send a generate command to the engine.
   * Returns the result. Progress events are emitted via the 'progress' event.
   */
  async generate(params: {
    id: string
    prompt: string
    width: number
    height: number
    seed?: number
    steps?: number
    guidance?: number
    sampling_method?: string
    ref_images?: string[]
    output: string
    use_prompt_cache?: boolean
    use_ref_latent_cache?: boolean
  }): Promise<EngineResultEvent> {
    if (this.state !== 'ready') {
      throw new Error(`Cannot generate in state: ${this.state}`)
    }

    const command: EngineCommand = {
      cmd: 'generate',
      id: params.id,
      params: {
        prompt: params.prompt,
        width: params.width,
        height: params.height,
        seed: params.seed ?? -1,
        steps: params.steps ?? 4,
        guidance: params.guidance ?? 3.5,
        sampling_method: params.sampling_method ?? 'euler',
        ref_images: params.ref_images ?? [],
        output: params.output,
        use_prompt_cache: params.use_prompt_cache ?? true,
        use_ref_latent_cache: params.use_ref_latent_cache ?? true
      }
    }

    try {
      // Generation can take a while, use a generous timeout (10 minutes)
      const response = await this.protocol.sendCommand(command, 600_000)

      const data = response.data ?? (response as any)

      // cn-engine returns `type: "result"` with `data.success` and `data.output`.
      const success =
        response.type === 'ok'
          ? true
          : response.type === 'result'
            ? Boolean((data as any)?.success)
            : false

      const outputPath =
        ((data as any)?.output_path as string | undefined) ??
        ((data as any)?.output as string | undefined)

      const seed =
        ((data as any)?.seed as number | undefined) ??
        ((data as any)?.used_seed as number | undefined)

      const totalTimeMs =
        ((data as any)?.total_time_ms as number | undefined) ??
        ((data as any)?.totalTimeMs as number | undefined)

      const promptCacheHit =
        ((data as any)?.prompt_cache_hit as boolean | undefined) ??
        ((data as any)?.promptCacheHit as boolean | undefined)

      const refLatentCacheHit =
        ((data as any)?.ref_latent_cache_hit as boolean | undefined) ??
        ((data as any)?.refLatentCacheHit as boolean | undefined)

      const errorMessage =
        (response.error as string | undefined) ??
        ((data as any)?.message as string | undefined) ??
        ((data as any)?.error as string | undefined)

      return {
        jobId: params.id,
        success,
        outputPath,
        seed,
        totalTimeMs,
        promptCacheHit,
        refLatentCacheHit,
        error: success ? undefined : errorMessage
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return {
        jobId: params.id,
        success: false,
        error: message
      }
    }
  }

  /**
   * Send an upscale command to the engine.
   * Does NOT require a diffusion model to be loaded — works in idle state.
   */
  async upscale(params: {
    id: string
    input: string
    output: string
    upscale_model: string
    upscale_repeats?: number
    upscale_factor?: number
  }): Promise<{ success: boolean; outputPath?: string; totalTimeMs?: number; error?: string }> {
    if (this.state === 'stopped' || this.state === 'starting') {
      throw new Error(`Cannot upscale in state: ${this.state}`)
    }

    const command: EngineCommand = {
      cmd: 'upscale',
      id: params.id,
      params: {
        input: params.input,
        output: params.output,
        upscale_model: params.upscale_model,
        upscale_repeats: params.upscale_repeats ?? 1,
        upscale_factor: params.upscale_factor
      }
    }

    try {
      const response = await this.protocol.sendCommand(command, 600_000)
      const data = response.data ?? (response as any)
      const success =
        response.type === 'ok' ? true : Boolean((data as any)?.success)
      const outputPath =
        ((data as any)?.output_path as string | undefined) ??
        ((data as any)?.output as string | undefined)
      const totalTimeMs =
        ((data as any)?.total_time_ms as number | undefined) ??
        ((data as any)?.totalTimeMs as number | undefined)
      const errorMessage =
        response.error ?? ((data as any)?.error as string | undefined)

      return {
        success,
        outputPath,
        totalTimeMs,
        error: success ? undefined : errorMessage
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return { success: false, error: message }
    }
  }

  /**
   * Unload the active model by restarting the engine process.
   * After this call the engine is back in 'idle' – ready for a fresh loadModel().
   */
  async unloadModel(): Promise<void> {
    if (this.state !== 'ready' && this.state !== 'loading') return

    // Restart the engine process to free all model memory
    await this.stop()
    await this.start()
  }

  /**
   * Gracefully shut down the engine.
   */
  async stop(): Promise<void> {
    if (!this.process) return

    this.setState('stopped')

    try {
      const quitId = `quit-${uuidv4()}`
      await this.protocol.sendCommand({ cmd: 'quit', id: quitId }, 5000)
    } catch {
      // Timeout or error - force kill
      console.warn('[EngineManager] Quit timed out, force-killing engine')
    }

    this.cleanup()
  }

  /**
   * Force-kill the engine process.
   */
  private cleanup(): void {
    if (this.process) {
      try {
        this.process.kill('SIGKILL')
      } catch {
        // Process may already be dead
      }
      this.process = null
    }
    this.protocol.detach()
    this.loadedModelName = null
  }

  /**
   * Attempt to restart the engine after an unexpected exit.
   */
  private async attemptRestart(): Promise<void> {
    if (this.restartAttempts >= this.maxRestartAttempts) {
      console.error(
        `[EngineManager] Max restart attempts (${this.maxRestartAttempts}) reached`
      )
      return
    }

    this.restartAttempts++
    const delay = this.restartAttempts * 2000 // Exponential backoff
    console.log(
      `[EngineManager] Attempting restart ${this.restartAttempts}/${this.maxRestartAttempts} in ${delay}ms`
    )

    await new Promise((resolve) => setTimeout(resolve, delay))

    try {
      await this.start()
    } catch (err) {
      console.error('[EngineManager] Restart failed:', err)
    }
  }

  /**
   * Update internal state and emit status change event.
   */
  private setState(state: EngineState, error?: string): void {
    this.state = state
    this.lastError = error ?? null

    const status = this.getStatus()
    this.emit('statusChanged', status)
  }
}
