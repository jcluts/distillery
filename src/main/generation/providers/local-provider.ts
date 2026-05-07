import type Database from 'better-sqlite3'
import * as settingsRepo from '../../db/repositories/settings'
import { EngineManager } from '../../engine/engine-manager'
import type { ModelCatalogService } from '../../models/model-catalog-service'
import type { GenerationProgressEvent, LocalGenerationBackend } from '../../types'
import { CnEngineGenerationExecutor } from './cn-engine-generation-executor'
import { SdCppGenerationExecutor } from './sd-cpp-generation-executor'
import { SdCppServerManager } from './sd-cpp-server-manager'
import type { GenerationProvider, GenerationRequest, GenerationResult } from './types'

export class LocalProvider implements GenerationProvider {
  readonly providerId = 'local'
  readonly executionMode = 'queued-local' as const

  private readonly db: Database.Database
  private readonly cnEngineExecutor: CnEngineGenerationExecutor
  private readonly sdCppExecutor: SdCppGenerationExecutor
  private readonly progressListeners = new Set<(event: GenerationProgressEvent) => void>()
  private executionLock: Promise<void> = Promise.resolve()
  private activeBackend: LocalGenerationBackend | null = null

  constructor(args: {
    engineManager: EngineManager
    db: Database.Database
    modelCatalogService: ModelCatalogService
    sdCppServerManager: SdCppServerManager
  }) {
    this.db = args.db
    const onProgress = (event: GenerationProgressEvent): void => {
      for (const listener of this.progressListeners) {
        listener(event)
      }
    }

    this.cnEngineExecutor = new CnEngineGenerationExecutor({
      engineManager: args.engineManager,
      db: args.db,
      modelCatalogService: args.modelCatalogService,
      onProgress
    })
    this.sdCppExecutor = new SdCppGenerationExecutor({
      db: args.db,
      modelCatalogService: args.modelCatalogService,
      serverManager: args.sdCppServerManager,
      onProgress
    })
  }

  on(event: 'progress', listener: (event: GenerationProgressEvent) => void): void {
    if (event === 'progress') {
      this.progressListeners.add(listener)
    }
  }

  async execute(request: GenerationRequest): Promise<GenerationResult> {
    return await this.withExecutionLock(async () => {
      const executor = await this.getExecutor()
      await executor.prepare(request)
      return await executor.execute(request)
    })
  }

  async stop(): Promise<void> {
    await this.sdCppExecutor.stop()
    await this.cnEngineExecutor.stop()
    this.activeBackend = null
  }

  private async getExecutor(): Promise<CnEngineGenerationExecutor | SdCppGenerationExecutor> {
    const backend = settingsRepo.getSetting(this.db, 'local_generation_backend')

    if (this.activeBackend && this.activeBackend !== backend) {
      if (this.activeBackend === 'stable-diffusion.cpp') {
        await this.sdCppExecutor.stop()
      } else {
        await this.cnEngineExecutor.stop()
      }
      this.activeBackend = null
    }

    this.activeBackend = backend
    return backend === 'stable-diffusion.cpp' ? this.sdCppExecutor : this.cnEngineExecutor
  }

  private async withExecutionLock<T>(action: () => Promise<T>): Promise<T> {
    const previous = this.executionLock
    let release!: () => void

    this.executionLock = new Promise<void>((resolve) => {
      release = resolve
    })

    await previous
    try {
      return await action()
    } finally {
      release()
    }
  }
}
