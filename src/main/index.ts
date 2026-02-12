import { app, shell, BrowserWindow } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { getDatabase, closeDatabase } from './db/connection'
import { EngineManager } from './engine/engine-manager'
import { TimelineService } from './timeline/timeline-service'
import { IPC_CHANNELS } from './ipc/channels'
import { registerLibraryHandlers } from './ipc/handlers/library'
import { registerGenerationHandlers } from './ipc/handlers/generation'
import { registerEngineHandlers } from './ipc/handlers/engine'
import { registerQueueHandlers } from './ipc/handlers/queue'
import { registerTimelineHandlers } from './ipc/handlers/timeline'
import { registerSettingsHandlers } from './ipc/handlers/settings'
import { getSetting } from './db/repositories/settings'

let mainWindow: BrowserWindow | null = null
let engineManager: EngineManager | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    show: false,
    frame: false,
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#141414',
      symbolColor: '#adadad',
      height: 36
    },
    autoHideMenuBar: true,
    backgroundColor: '#1f1f1f',
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      webSecurity: true
    }
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

  engine.on('progress', (event) => {
    mainWindow?.webContents.send(IPC_CHANNELS.ENGINE_PROGRESS, event)
  })
}

// =============================================================================
// App Lifecycle
// =============================================================================

app.whenReady().then(async () => {
  electronApp.setAppUserModelId('com.distillery')

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

  // Initialize engine manager
  const enginePath = getSetting(db, 'engine_path')
  engineManager = new EngineManager(enginePath || '')
  console.log('[Main] Engine manager created')

  // Register all IPC handlers
  registerLibraryHandlers()
  registerGenerationHandlers()
  registerEngineHandlers(engineManager)
  registerQueueHandlers()
  registerTimelineHandlers()
  registerSettingsHandlers()
  console.log('[Main] IPC handlers registered')

  // Create window
  createWindow()

  // Forward engine events to renderer
  if (engineManager) {
    setupEngineEventForwarding(engineManager)
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
