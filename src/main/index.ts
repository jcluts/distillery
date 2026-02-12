import { app, shell, BrowserWindow, protocol } from 'electron'
import { join } from 'path'
import * as path from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { getDatabase, closeDatabase } from './db/connection'
import { EngineManager } from './engine/engine-manager'
import { TimelineService } from './timeline/timeline-service'
import { WorkQueueManager } from './queue/work-queue-manager'
import { WORK_TASK_TYPES } from './queue/work-task-types'
import { PlaceholderHeavyTaskHandler } from './queue/placeholder-heavy-task-handler'
import { mapWorkItemsToQueueItems } from './queue/work-queue-view'
import { FileManager } from './files/file-manager'
import { GenerationIOService } from './generation/generation-io-service'
import { GenerationService } from './generation/generation-service'
import { LocalCnEngineProvider } from './generation/providers/local-cn-provider'
import { RemoteApiProvider } from './generation/providers/remote-api-provider'
import { ProviderCatalogService } from './generation/catalog/provider-catalog-service'
import { LocalGenerateTaskHandler } from './generation/tasks/local-generate-task'
import { IPC_CHANNELS } from './ipc/channels'
import { applyActiveProfileUserDataPath } from './profiles'
import { registerLibraryHandlers } from './ipc/handlers/library'
import { registerGenerationHandlers } from './ipc/handlers/generation'
import { registerEngineHandlers } from './ipc/handlers/engine'
import { registerQueueHandlers } from './ipc/handlers/queue'
import { registerTimelineHandlers } from './ipc/handlers/timeline'
import { registerSettingsHandlers } from './ipc/handlers/settings'
import { registerWindowHandlers } from './ipc/handlers/window'
import { getSetting } from './db/repositories/settings'

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
    const generationQueueView = mapWorkItemsToQueueItems(queue.getItems())
    mainWindow?.webContents.send(IPC_CHANNELS.QUEUE_UPDATED, generationQueueView)
  })
}

function setupGenerationEventForwarding(service: GenerationService): void {
  service.on('progress', (event) => {
    mainWindow?.webContents.send(IPC_CHANNELS.GENERATION_PROGRESS, event)
    mainWindow?.webContents.send(IPC_CHANNELS.ENGINE_PROGRESS, {
      jobId: event.generationId,
      phase: event.phase,
      step: event.step,
      totalSteps: event.totalSteps,
      message: event.message
    })
  })

  service.on('result', (event) => {
    mainWindow?.webContents.send(IPC_CHANNELS.GENERATION_RESULT, event)
    mainWindow?.webContents.send(IPC_CHANNELS.ENGINE_RESULT, {
      jobId: event.generationId,
      success: event.success,
      outputPath: event.outputs?.[0]?.providerPath,
      seed: event.metrics?.seed,
      totalTimeMs: event.metrics?.totalTimeMs,
      promptCacheHit: event.metrics?.promptCacheHit,
      refLatentCacheHit: event.metrics?.refLatentCacheHit,
      error: event.error
    })
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

  const profileInfo = applyActiveProfileUserDataPath()
  console.log(
    `[Main] Active profile: ${profileInfo.activeProfile} (userData: ${profileInfo.profileUserDataPath})`
  )

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
      if (url.hostname !== 'library') {
        callback({ error: -6 })
        return
      }

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
    } catch {
      callback({ error: -6 })
    }
  })

  // Initialize engine manager
  const enginePath = getSetting(db, 'engine_path')
  engineManager = new EngineManager(enginePath || '')
  console.log('[Main] Engine manager created')

  // Initialize work queue + generation services
  workQueueManager = new WorkQueueManager(db)
  const generationIOService = new GenerationIOService(db, fileManager)
  const providerCatalogService = new ProviderCatalogService()
  const localProvider = new LocalCnEngineProvider(engineManager)
  const remoteApiProvider = new RemoteApiProvider()

  generationService = new GenerationService({
    db,
    workQueueManager,
    generationIOService,
    providerCatalogService,
    remoteApiProvider
  })

  await generationService.initialize()

  localProvider.on('progress', (event) => {
    generationService?.emitProgress(event)
  })

  workQueueManager.registerHandler(
    WORK_TASK_TYPES.GENERATION_LOCAL_IMAGE,
    new LocalGenerateTaskHandler({
      db,
      generationIOService,
      localProvider,
      providerCatalogService,
      generationService
    })
  )

  workQueueManager.registerHandler(
    WORK_TASK_TYPES.PLACEHOLDER_HEAVY_TASK,
    new PlaceholderHeavyTaskHandler()
  )

  console.log('[Main] Work queue + generation services initialized')

  // Register all IPC handlers
  registerLibraryHandlers(fileManager, () => {
    mainWindow?.webContents.send(IPC_CHANNELS.LIBRARY_UPDATED)
  })
  registerGenerationHandlers(generationService)
  registerEngineHandlers(engineManager)
  registerQueueHandlers(workQueueManager)
  registerTimelineHandlers()
  registerSettingsHandlers({
    engineManager,
    fileManager,
    onLibraryRootChanged: () => {
      mainWindow?.webContents.send(IPC_CHANNELS.LIBRARY_UPDATED)
    }
  })
  registerWindowHandlers(() => mainWindow)
  console.log('[Main] IPC handlers registered')

  // Create window
  createWindow()

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

  // Start engine if path is configured
  if (enginePath) {
    try {
      await engineManager.start()
      console.log('[Main] Engine started')

      // Auto-load model if paths are configured
      const diffusionPath = getSetting(db, 'diffusion_model_path')
      const vaePath = getSetting(db, 'vae_path')
      const llmPath = getSetting(db, 'llm_path')

      if (diffusionPath && vaePath && llmPath) {
        await engineManager.loadModel({
          diffusion_model: diffusionPath,
          vae: vaePath,
          llm: llmPath,
          offload_to_cpu: getSetting(db, 'offload_to_cpu'),
          flash_attn: getSetting(db, 'flash_attn'),
          vae_on_cpu: getSetting(db, 'vae_on_cpu'),
          llm_on_cpu: getSetting(db, 'llm_on_cpu')
        })
      }
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
