import { app, shell, BrowserWindow, protocol } from 'electron'
import * as fs from 'fs'
import { join } from 'path'
import * as path from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { getDatabase, closeDatabase } from './db/connection'
import { EngineManager } from './engine/engine-manager'
import { TimelineService } from './timeline/timeline-service'
import { WorkQueueManager } from './queue/work-queue-manager'
import { WORK_TASK_TYPES } from './queue/work-task-types'
import { FileManager } from './files/file-manager'
import { MediaIngestionService } from './generation/media-ingestion-service'
import { GenerationService } from './generation/generation-service'
import { LocalCnProvider } from './generation/providers/local-cn-provider'
import { RemoteApiProvider } from './generation/providers/remote-api-provider'
import { ProviderRegistry } from './generation/providers/provider-registry'
import { EndpointCatalog } from './generation/catalog/endpoint-catalog'
import { ProviderConfigService } from './generation/catalog/provider-config'
import { ModelIdentityService } from './generation/catalog/model-identity-service'
import { ProviderManager } from './generation/management/provider-manager'
import { GenerateTaskHandler } from './generation/generate-task-handler'
import { registerProviderAdapter } from './generation/remote/adapters/adapter-registry'
import { falAdapter } from './generation/remote/adapters/fal-adapter'
import { replicateAdapter } from './generation/remote/adapters/replicate-adapter'
import { wavespeedAdapter } from './generation/remote/adapters/wavespeed-adapter'
import { IPC_CHANNELS } from './ipc/channels'
import { registerLibraryHandlers } from './ipc/handlers/library'
import { registerGenerationHandlers } from './ipc/handlers/generation'
import { registerEngineHandlers } from './ipc/handlers/engine'
import { registerQueueHandlers } from './ipc/handlers/queue'
import { registerTimelineHandlers } from './ipc/handlers/timeline'
import { registerSettingsHandlers } from './ipc/handlers/settings'
import { registerModelHandlers } from './ipc/handlers/models'
import { registerKeywordsHandlers } from './ipc/handlers/keywords'
import { registerCollectionsHandlers } from './ipc/handlers/collections'
import { registerImportFolderHandlers } from './ipc/handlers/import-folders'
import { registerWindowHandlers } from './ipc/handlers/window'
import { registerProviderHandlers } from './ipc/handlers/providers'
import { registerUpscaleHandlers } from './ipc/handlers/upscale'
import { UpscaleModelService } from './upscale/upscale-model-service'
import { UpscaleService } from './upscale/upscale-service'
import { UpscaleTaskHandler } from './upscale/upscale-task-handler'
import { getAllSettings, getSetting, saveSettings } from './db/repositories/settings'
import * as identityRepo from './db/repositories/model-identities'
import { ModelCatalogService } from './models/model-catalog-service'
import { ModelDownloadManager } from './models/model-download-manager'
import { bootstrapQuantSelections } from './models/selection-bootstrap'
import { initializeAutoImportFolders } from './import/import-folder-service'

// Allow the renderer to load library files via a safe custom protocol.
// This avoids `file://` restrictions when running the renderer from http:// (dev server).
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'distillery',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true
    }
  }
])

let mainWindow: BrowserWindow | null = null
let engineManager: EngineManager | null = null
let workQueueManager: WorkQueueManager | null = null
let generationService: GenerationService | null = null
let fileManager: FileManager | null = null

/**
 * Migrate user-created identities from the legacy model-identities.json file
 * into the new DB tables, then delete the JSON file.
 */
function migrateJsonIdentities(db: import('better-sqlite3').Database): void {
  const jsonPath = path.join(app.getPath('userData'), 'model-identities.json')
  if (!fs.existsSync(jsonPath)) return

  try {
    const parsed = JSON.parse(fs.readFileSync(jsonPath, 'utf8')) as Record<
      string,
      { id: string; name: string; description?: string; providerMapping?: Record<string, string[]> }
    >

    db.transaction(() => {
      for (const [id, identity] of Object.entries(parsed)) {
        if (!id || !identity?.name) continue

        // Insert identity if it doesn't already exist (seed data may overlap)
        const existing = identityRepo.getIdentityById(db, id)
        if (!existing) {
          identityRepo.createIdentity(db, id, identity.name, identity.description)
        }

        // Insert any provider mappings
        for (const [providerId, modelIds] of Object.entries(identity.providerMapping ?? {})) {
          for (const modelId of modelIds) {
            if (modelId?.trim()) {
              identityRepo.addMapping(db, id, providerId, modelId.trim())
            }
          }
        }
      }
    })()

    fs.unlinkSync(jsonPath)
    console.log('[Main] Migrated model-identities.json to DB and deleted JSON file')
  } catch (error) {
    console.warn('[Main] Failed to migrate model-identities.json:', error)
  }
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    show: false,
    frame: false,
    titleBarStyle: 'hidden',
    // NOTE: We intentionally do NOT use native Windows caption buttons.
    // We render custom window controls in the renderer so they match app chrome.
    autoHideMenuBar: true,
    backgroundColor: '#1f1f1f',
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      webSecurity: true
    }
  })

  // Forward maximize state so the renderer can swap maximize/restore icons.
  mainWindow.on('maximize', () => {
    mainWindow?.webContents.send(IPC_CHANNELS.WINDOW_MAXIMIZED_CHANGED, true)
  })
  mainWindow.on('unmaximize', () => {
    mainWindow?.webContents.send(IPC_CHANNELS.WINDOW_MAXIMIZED_CHANGED, false)
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer based on electron-vite cli.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

/**
 * Forward engine events to the renderer process via IPC.
 */
function setupEngineEventForwarding(engine: EngineManager): void {
  engine.on('statusChanged', (status) => {
    mainWindow?.webContents.send(IPC_CHANNELS.ENGINE_STATUS_CHANGED, status)
  })
}

function setupWorkQueueEventForwarding(queue: WorkQueueManager): void {
  queue.on('updated', () => {
    const generationWorkItems = queue.getItems({ owner_module: 'generation' })
    mainWindow?.webContents.send(IPC_CHANNELS.QUEUE_UPDATED, generationWorkItems)
  })
}

function setupGenerationEventForwarding(service: GenerationService): void {
  service.on('progress', (event) => {
    mainWindow?.webContents.send(IPC_CHANNELS.GENERATION_PROGRESS, event)
  })

  service.on('result', (event) => {
    mainWindow?.webContents.send(IPC_CHANNELS.GENERATION_RESULT, event)
  })

  service.on('libraryUpdated', () => {
    mainWindow?.webContents.send(IPC_CHANNELS.LIBRARY_UPDATED)
  })
}

// =============================================================================
// App Lifecycle
// =============================================================================

app.whenReady().then(async () => {
  electronApp.setAppUserModelId('com.distillery')

  console.log(`[Main] userData: ${app.getPath('userData')}`)

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // Initialize database
  const db = getDatabase()
  console.log('[Main] Database initialized')

  // Initialize timeline service (marks interrupted jobs)
  const timelineService = new TimelineService(db)
  timelineService.initialize()
  console.log('[Main] Timeline service initialized')

  const modelCatalogService = new ModelCatalogService()
  const modelCatalog = modelCatalogService.loadCatalog()

  const initialSettings = getAllSettings(db)
  const bootstrap = bootstrapQuantSelections({
    catalog: modelCatalog,
    settings: initialSettings
  })

  if (bootstrap.updated) {
    saveSettings(db, { model_quant_selections: bootstrap.selections })
  }

  const startupSettings = bootstrap.updated
    ? {
        ...initialSettings,
        model_quant_selections: bootstrap.selections
      }
    : initialSettings

  if (is.dev) {
    const modelBasePath = path.resolve(startupSettings.model_base_path || '')
    const activeModelId = startupSettings.active_model_id
    const activeSelections = startupSettings.model_quant_selections?.[activeModelId]

    console.log('[ConfigDebug] ===== Model Path Diagnostics =====')
    console.log(`[ConfigDebug] userData: ${app.getPath('userData')}`)
    console.log(`[ConfigDebug] settings.model_base_path: ${startupSettings.model_base_path}`)
    console.log(`[ConfigDebug] resolved model_base_path: ${modelBasePath}`)
    console.log(`[ConfigDebug] model base exists: ${fs.existsSync(modelBasePath)}`)

    if (fs.existsSync(modelBasePath)) {
      try {
        const entries = fs
          .readdirSync(modelBasePath, { withFileTypes: true })
          .slice(0, 24)
          .map((entry) => `${entry.isDirectory() ? 'dir' : 'file'}:${entry.name}`)
        console.log(`[ConfigDebug] model base entries: ${entries.join(', ') || '(empty)'}`)
      } catch (error) {
        console.warn('[ConfigDebug] Failed to list model_base_path entries:', error)
      }
    }

    console.log(`[ConfigDebug] active model: ${activeModelId}`)
    console.log(
      `[ConfigDebug] selected quants: diffusion=${activeSelections?.diffusionQuant || '(none)'} textEncoder=${activeSelections?.textEncoderQuant || '(none)'}`
    )

    const activeModel = modelCatalog.models.find((model) => model.id === activeModelId)

    if (!activeModel) {
      console.warn(`[ConfigDebug] Active model not found in catalog: ${activeModelId}`)
    } else {
      const expectedRelativePaths: string[] = [activeModel.vae.file]

      if (activeSelections?.diffusionQuant) {
        const diffusionQuant = activeModel.diffusion.quants.find(
          (quant) => quant.id === activeSelections.diffusionQuant
        )
        if (diffusionQuant) {
          expectedRelativePaths.push(diffusionQuant.file)
        } else {
          console.warn(
            `[ConfigDebug] Diffusion quant not found for ${activeModel.id}: ${activeSelections.diffusionQuant}`
          )
        }
      }

      if (activeSelections?.textEncoderQuant) {
        const textEncoderQuant = activeModel.textEncoder.quants.find(
          (quant) => quant.id === activeSelections.textEncoderQuant
        )
        if (textEncoderQuant) {
          expectedRelativePaths.push(textEncoderQuant.file)
        } else {
          console.warn(
            `[ConfigDebug] Text encoder quant not found for ${activeModel.id}: ${activeSelections.textEncoderQuant}`
          )
        }
      }

      for (const relativePath of expectedRelativePaths) {
        const absolutePath = path.join(modelBasePath, path.normalize(relativePath))
        console.log(
          `[ConfigDebug] file check: ${relativePath} -> ${absolutePath} exists=${fs.existsSync(absolutePath)}`
        )
      }
    }

    console.log('[ConfigDebug] ==================================')
  }

  const modelDownloadManager = new ModelDownloadManager(startupSettings.model_base_path)

  // Initialize file manager (library root)
  const libraryRoot = getSetting(db, 'library_root')
  fileManager = new FileManager(libraryRoot)
  console.log(`[Main] File manager initialized (library_root: ${libraryRoot})`)

  // Register distillery:// protocol for loading library files in the renderer.
  // URL format: distillery://library/<relative-path>
  protocol.registerFileProtocol('distillery', (request, callback) => {
    if (!fileManager) {
      callback({ error: -6 })
      return
    }

    try {
      const url = new URL(request.url)
      if (url.hostname === 'library') {
        const raw = decodeURIComponent(url.pathname.replace(/^\//, ''))
        const rel = raw.replace(/\//g, path.sep)
        const abs = fileManager.resolve(rel)

        const root = path.resolve(fileManager.getLibraryRoot())
        const resolved = path.resolve(abs)
        const rootNorm = process.platform === 'win32' ? root.toLowerCase() : root
        const resolvedNorm = process.platform === 'win32' ? resolved.toLowerCase() : resolved

        if (!resolvedNorm.startsWith(rootNorm + path.sep) && resolvedNorm !== rootNorm) {
          callback({ error: -10 })
          return
        }

        callback({ path: resolved })
        return
      }

      if (url.hostname === 'external') {
        const encoded = url.pathname.replace(/^\//, '')
        const decoded = decodeURIComponent(encoded)
        if (!path.isAbsolute(decoded)) {
          callback({ error: -10 })
          return
        }

        callback({ path: decoded })
        return
      }

      callback({ error: -6 })
      return
    } catch {
      callback({ error: -6 })
    }
  })

  // Initialize engine manager
  const enginePath = startupSettings.engine_path
  engineManager = new EngineManager(enginePath || '')
  console.log('[Main] Engine manager created')

  // Initialize work queue + generation services
  workQueueManager = new WorkQueueManager(db)
  const mediaIngestionService = new MediaIngestionService(db, fileManager)
  const providerConfigService = new ProviderConfigService()
  const modelIdentityService = new ModelIdentityService(db)

  // Migrate user-created identities from the legacy JSON file (if it exists)
  migrateJsonIdentities(db)

  registerProviderAdapter('fal', falAdapter)
  registerProviderAdapter('replicate', replicateAdapter)
  registerProviderAdapter('wavespeed', wavespeedAdapter)

  let endpointCatalog: EndpointCatalog
  const providerManagerService = new ProviderManager({
    db,
    configService: providerConfigService,
    identityService: modelIdentityService,
    onModelsChanged: () => endpointCatalog.invalidate()
  })

  endpointCatalog = new EndpointCatalog(providerConfigService, () =>
    providerManagerService.getProvidersWithUserModels(),
  (providerId, providerModelId) => modelIdentityService.findIdentityId(providerModelId, providerId)
  )

  const providerRegistry = new ProviderRegistry()
  const localProvider = new LocalCnProvider({
    engineManager,
    db,
    modelCatalogService
  })
  providerRegistry.register(localProvider)

  const remoteProviderConfigs = providerManagerService.getProviders()
  for (const providerConfig of remoteProviderConfigs) {
    providerRegistry.register(
      new RemoteApiProvider(providerConfig, () =>
        providerManagerService.getApiKey(providerConfig.providerId)
      )
    )
  }

  generationService = new GenerationService({
    db,
    workQueueManager,
    mediaIngestionService,
    endpointCatalog
  })

  for (const provider of providerRegistry.list()) {
    provider.on?.('progress', (event) => {
      generationService?.emitProgress(event)
    })
  }

  workQueueManager.registerHandler(
    WORK_TASK_TYPES.GENERATION,
    new GenerateTaskHandler({
      db,
      generationService,
      mediaIngestionService,
      endpointCatalog,
      providerRegistry
    })
  )

  workQueueManager.setConcurrencyLimit(WORK_TASK_TYPES.GENERATION, 4)

  console.log('[Main] Work queue + generation services initialized')

  // Initialize upscale services
  const upscaleModelService = new UpscaleModelService()
  const upscaleService = new UpscaleService({
    db,
    fileManager,
    modelService: upscaleModelService,
    workQueueManager
  })

  workQueueManager.registerHandler(
    WORK_TASK_TYPES.UPSCALE,
    new UpscaleTaskHandler({
      db,
      engineManager,
      modelService: upscaleModelService,
      upscaleService,
      fileManager
    })
  )
  workQueueManager.setConcurrencyLimit(WORK_TASK_TYPES.UPSCALE, 1)

  console.log('[Main] Upscale services initialized')

  // Register all IPC handlers
  registerLibraryHandlers(fileManager, () => {
    mainWindow?.webContents.send(IPC_CHANNELS.LIBRARY_UPDATED)
  })
  registerGenerationHandlers(generationService)
  registerEngineHandlers(engineManager)
  registerQueueHandlers(workQueueManager)
  registerTimelineHandlers()
  registerKeywordsHandlers()
  registerCollectionsHandlers({
    onCollectionsUpdated: () => {
      mainWindow?.webContents.send(IPC_CHANNELS.COLLECTIONS_UPDATED)
    },
    onLibraryUpdated: () => {
      mainWindow?.webContents.send(IPC_CHANNELS.LIBRARY_UPDATED)
    }
  })
  registerImportFolderHandlers(fileManager, {
    onImportFoldersUpdated: () => {
      mainWindow?.webContents.send(IPC_CHANNELS.IMPORT_FOLDERS_UPDATED)
    },
    onLibraryUpdated: () => {
      mainWindow?.webContents.send(IPC_CHANNELS.LIBRARY_UPDATED)
    },
    onScanProgress: (progress) => {
      mainWindow?.webContents.send(IPC_CHANNELS.IMPORT_SCAN_PROGRESS, progress)
    }
  })
  registerSettingsHandlers({
    engineManager,
    fileManager,
    modelDownloadManager,
    onLibraryRootChanged: () => {
      mainWindow?.webContents.send(IPC_CHANNELS.LIBRARY_UPDATED)
    }
  })
  registerModelHandlers({
    modelCatalogService,
    modelDownloadManager,
    onDownloadProgress: (event) => {
      mainWindow?.webContents.send(IPC_CHANNELS.MODEL_DOWNLOAD_PROGRESS, event)
    }
  })
  registerWindowHandlers(() => mainWindow)
  registerProviderHandlers({
    providerManagerService,
    modelIdentityService
  })
  registerUpscaleHandlers(upscaleService)
  console.log('[Main] IPC handlers registered')

  // Create window
  createWindow()

  // Auto-scan persisted import folders configured for startup import.
  await initializeAutoImportFolders(db, fileManager, (progress) => {
    mainWindow?.webContents.send(IPC_CHANNELS.IMPORT_SCAN_PROGRESS, progress)

    if (progress.status === 'complete') {
      mainWindow?.webContents.send(IPC_CHANNELS.IMPORT_FOLDERS_UPDATED)
      if (progress.files_imported > 0) {
        mainWindow?.webContents.send(IPC_CHANNELS.LIBRARY_UPDATED)
      }
    }
  })

  // Forward engine events to renderer
  if (engineManager) {
    setupEngineEventForwarding(engineManager)
  }

  if (workQueueManager) {
    setupWorkQueueEventForwarding(workQueueManager)
  }

  if (generationService) {
    setupGenerationEventForwarding(generationService)
  }

  // Forward upscale events to renderer
  upscaleService.on('progress', (event) => {
    mainWindow?.webContents.send(IPC_CHANNELS.UPSCALE_PROGRESS, event)
  })
  upscaleService.on('result', (event) => {
    mainWindow?.webContents.send(IPC_CHANNELS.UPSCALE_RESULT, event)
    mainWindow?.webContents.send(IPC_CHANNELS.LIBRARY_UPDATED)
  })

  // Start engine process if path is configured (model will be lazy-loaded on first generation)
  if (enginePath) {
    try {
      await engineManager.start()
      console.log('[Main] Engine started (model will load on first generation)')
    } catch (err) {
      console.error('[Main] Engine startup error:', err)
    }
  } else {
    console.log('[Main] Engine path not configured, skipping engine start')
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', async () => {
  // Gracefully shut down engine
  if (engineManager) {
    try {
      await engineManager.stop()
    } catch {
      console.warn('[Main] Engine shutdown error (force-killed)')
    }
  }

  // Close database
  closeDatabase()
  console.log('[Main] Cleanup complete')
})
