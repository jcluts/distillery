import { EventEmitter } from 'events'
import { createInterface, Interface as ReadlineInterface } from 'readline'
import type { ChildProcess } from 'child_process'

// =============================================================================
// NDJSON Protocol Handler for cn-engine
// Handles encoding commands to stdin and decoding responses from stdout.
// =============================================================================

/** A command to send to the engine */
export interface EngineCommand {
  cmd: string
  id: string
  params?: Record<string, unknown>
}

/** A response from the engine */
export interface EngineResponse {
  id: string
  type: string
  data?: Record<string, unknown>
  error?: string
}

/** Callback for pending requests */
interface PendingRequest {
  resolve: (response: EngineResponse) => void
  reject: (error: Error) => void
  timeout: ReturnType<typeof setTimeout>
}

export class EngineProtocol extends EventEmitter {
  private pendingRequests = new Map<string, PendingRequest>()
  private readline: ReadlineInterface | null = null
  private process: ChildProcess | null = null

  /** Default timeout for requests (30 seconds) */
  private static readonly DEFAULT_TIMEOUT = 30_000
  /** Load timeout (5 minutes - model loading can be slow) */
  static readonly LOAD_TIMEOUT = 300_000

  /**
   * Attach to a child process's stdio streams.
   */
  attach(childProcess: ChildProcess): void {
    this.detach()
    this.process = childProcess

    if (!childProcess.stdout) {
      throw new Error('Engine process has no stdout')
    }

    this.readline = createInterface({
      input: childProcess.stdout,
      crlfDelay: Infinity
    })

    this.readline.on('line', (line) => this.handleLine(line))

    // Capture stderr for logging
    childProcess.stderr?.on('data', (data: Buffer) => {
      const text = data.toString().trim()
      if (text) {
        console.log(`[engine:stderr] ${text}`)
        this.emit('stderr', text)
      }
    })
  }

  /**
   * Detach from the current process.
   */
  detach(): void {
    if (this.readline) {
      this.readline.close()
      this.readline = null
    }
    this.process = null

    // Reject all pending requests
    for (const [id, pending] of this.pendingRequests) {
      clearTimeout(pending.timeout)
      pending.reject(new Error('Engine disconnected'))
      this.pendingRequests.delete(id)
    }
  }

  /**
   * Send a command and wait for the response.
   */
  async sendCommand(
    command: EngineCommand,
    timeout = EngineProtocol.DEFAULT_TIMEOUT
  ): Promise<EngineResponse> {
    if (!this.process?.stdin?.writable) {
      throw new Error('Engine process stdin not writable')
    }

    return new Promise((resolve, reject) => {
      const timeoutHandle = setTimeout(() => {
        this.pendingRequests.delete(command.id)
        reject(new Error(`Engine command '${command.cmd}' timed out after ${timeout}ms`))
      }, timeout)

      this.pendingRequests.set(command.id, {
        resolve,
        reject,
        timeout: timeoutHandle
      })

      const json = JSON.stringify(command) + '\n'
      this.process!.stdin!.write(json)
    })
  }

  /**
   * Handle a line of NDJSON output from the engine.
   */
  private handleLine(line: string): void {
    const trimmed = line.trim()
    if (!trimmed) return

    let response: EngineResponse
    try {
      response = JSON.parse(trimmed)
    } catch {
      console.warn(`[engine:protocol] Failed to parse line: ${trimmed}`)
      return
    }

    // Check if this is a progress event (streaming, not a final response)
    if (response.type === 'progress') {
      this.emit('progress', response)

      // Progress events don't resolve pending requests
      return
    }

    // Route to pending request
    const pending = this.pendingRequests.get(response.id)
    if (pending) {
      clearTimeout(pending.timeout)
      this.pendingRequests.delete(response.id)

      if (response.type === 'error') {
        const dataMessage =
          (response.data?.message as string | undefined) ??
          (response.data?.error as string | undefined)
        const rootMessage = (response as any)?.message as string | undefined
        pending.reject(
          new Error(
            response.error ?? dataMessage ?? rootMessage ?? 'Unknown engine error'
          )
        )
      } else {
        pending.resolve(response)
      }
    } else {
      // Unmatched response - emit as event for logging
      this.emit('unmatched', response)
    }
  }
}
