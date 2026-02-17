import { useCallback, useEffect, useRef } from 'react'

import { AppLayout } from '@/components/layout/AppLayout'
import { GenerationDetailModal } from '@/components/modals/GenerationDetailModal'
import { ModelManagerModal } from '@/components/modals/ModelManagerModal'
import { SettingsModal } from '@/components/modals/SettingsModal'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useModelCatalog } from '@/hooks/useModelCatalog'
import { useModelDownload } from '@/hooks/useModelDownload'
import { useEngineStore } from './stores/engine-store'
import { useGenerationStore } from './stores/generation-store'
import { useLibraryStore } from './stores/library-store'
import { useQueueStore } from './stores/queue-store'
import type {
  GenerationProgressEvent,
  GenerationResultEvent,
  EngineStatus,
  WorkQueueItem
} from './types'

function App(): React.JSX.Element {
  useModelCatalog()
  useModelDownload()

  const setEngineStatus = useEngineStore((s) => s.setStatus)

  const setMediaPage = useLibraryStore((s) => s.setItems)
  const selectSingle = useLibraryStore((s) => s.selectSingle)
  const focusedId = useLibraryStore((s) => s.focusedId)
  const buildLibraryQuery = useLibraryStore((s) => s.buildQuery)
  const setLibraryLoading = useLibraryStore((s) => s.setLoading)
  const page = useLibraryStore((s) => s.page)
  const pageSize = useLibraryStore((s) => s.pageSize)
  const ratingFilter = useLibraryStore((s) => s.ratingFilter)
  const statusFilter = useLibraryStore((s) => s.statusFilter)
  const searchQuery = useLibraryStore((s) => s.searchQuery)
  const sortField = useLibraryStore((s) => s.sortField)
  const sortDirection = useLibraryStore((s) => s.sortDirection)

  const setGenerations = useGenerationStore((s) => s.setGenerations)

  const setQueueItems = useQueueStore((s) => s.setItems)
  const startTimer = useQueueStore((s) => s.startTimer)
  const setActiveProgress = useQueueStore((s) => s.setActiveProgress)
  const clearActiveProgress = useQueueStore((s) => s.clearActiveProgress)
  const activeJobId = useQueueStore((s) => s.activeJobId)
  const activePhase = useQueueStore((s) => s.activePhase)
  const activeStep = useQueueStore((s) => s.activeStep)
  const activeTotalSteps = useQueueStore((s) => s.activeTotalSteps)

  const debounceRef = useRef<number | null>(null)

  const syncActiveFromQueue = useCallback(
    (items: WorkQueueItem[]): void => {
      const processing = items.find((q) => q.status === 'processing')
      if (!processing) {
        clearActiveProgress()
        return
      }

      const generationId = processing.correlation_id
      if (!generationId) return

      if (activeJobId !== generationId) {
        startTimer(generationId)
      }

      if (!activePhase) {
        setActiveProgress(generationId, 'Processing')
      }
    },
    [activeJobId, activePhase, clearActiveProgress, setActiveProgress, startTimer]
  )

  const loadMedia = useCallback(async (): Promise<void> => {
    setLibraryLoading(true)
    try {
      const mediaPage = await window.api.getMedia(buildLibraryQuery())
      setMediaPage(mediaPage)
      if (!focusedId && mediaPage.items[0]) selectSingle(mediaPage.items[0].id)
    } catch {
      // ignore for MVP wiring
    } finally {
      setLibraryLoading(false)
    }
  }, [buildLibraryQuery, focusedId, selectSingle, setLibraryLoading, setMediaPage])

  const loadTimeline = useCallback(async (): Promise<void> => {
    try {
      const { generations } = await window.api.timeline.getAll()
      setGenerations(generations)
    } catch {
      // ignore
    }
  }, [setGenerations])

  const loadQueue = useCallback(async (): Promise<void> => {
    try {
      const items = await window.api.getQueue()
      setQueueItems(items)
      syncActiveFromQueue(items)
    } catch {
      // ignore
    }
  }, [setQueueItems, syncActiveFromQueue])

  // Subscribe to engine status events
  useEffect(() => {
    const unsubscribe = window.api.on('engine:status', (status: unknown) => {
      setEngineStatus(status as EngineStatus)
    })

    return unsubscribe
  }, [setEngineStatus])

  // Hydrate initial state
  useEffect(() => {
    window.api
      .getEngineStatus()
      .then(setEngineStatus)
      .catch(() => {})
  }, [setEngineStatus])

  // Initial hydration (library, timeline, queue)
  useEffect(() => {
    void loadMedia()
    void loadTimeline()
    void loadQueue()
  }, [loadMedia, loadQueue, loadTimeline])

  // Re-query library on filter changes.
  useEffect(() => {
    if (debounceRef.current) {
      window.clearTimeout(debounceRef.current)
      debounceRef.current = null
    }

    debounceRef.current = window.setTimeout(() => {
      void loadMedia()
    }, 150)

    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current)
    }
  }, [loadMedia, page, pageSize, ratingFilter, searchQuery, sortDirection, sortField, statusFilter])

  // Queue updates
  useEffect(() => {
    const unsubscribe = window.api.on('queue:updated', (payload: unknown) => {
      const items = (payload as WorkQueueItem[]) ?? []
      setQueueItems(items)
      syncActiveFromQueue(items)
    })
    return unsubscribe
  }, [setQueueItems, syncActiveFromQueue])

  // Library updates (imports/new generations)
  useEffect(() => {
    const unsubscribe = window.api.on('library:updated', () => {
      void loadMedia()
    })
    return unsubscribe
  }, [loadMedia])

  // Generation progress -> status bar / queue progress
  useEffect(() => {
    const unsubscribe = window.api.on('generation:progress', (payload: unknown) => {
      const evt = payload as GenerationProgressEvent
      if (!evt?.generationId) return
      if (activeJobId !== evt.generationId) startTimer(evt.generationId)
      setActiveProgress(evt.generationId, evt.phase, evt.step, evt.totalSteps)
    })
    return unsubscribe
  }, [activeJobId, setActiveProgress, startTimer])

  // Generation result -> refresh queue + library + timeline
  useEffect(() => {
    const unsubscribe = window.api.on('generation:result', (payload: unknown) => {
      const evt = payload as GenerationResultEvent
      if (!evt?.generationId) return
      void loadQueue()
      void loadMedia()
      void loadTimeline()
    })
    return unsubscribe
  }, [loadMedia, loadQueue, loadTimeline])

  // Keep elapsed time ticking while active
  useEffect(() => {
    const id = window.setInterval(() => {
      if (activeJobId && activePhase) {
        setActiveProgress(
          activeJobId,
          activePhase,
          activeStep ?? undefined,
          activeTotalSteps ?? undefined
        )
      }
    }, 250)
    return () => window.clearInterval(id)
  }, [activeJobId, activePhase, activeStep, activeTotalSteps, setActiveProgress])

  return (
    <TooltipProvider delayDuration={300}>
      <AppLayout />
      <GenerationDetailModal />
      <SettingsModal />
      <ModelManagerModal />
    </TooltipProvider>
  )
}

export default App
