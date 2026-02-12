import { useEffect } from 'react'
import { useEngineStore } from './stores/engine-store'
import { useGenerationStore } from './stores/generation-store'
import { useLibraryStore } from './stores/library-store'
import { useQueueStore } from './stores/queue-store'
import type { EngineStatus } from './types'
import { AppLayout } from '@/components/layout/AppLayout'
import {
  createMockEngineStatus,
  createMockGenerations,
  createMockMediaPage,
  createMockQueueItems
} from '@/lib/mock-data'

function App(): React.JSX.Element {
  const setEngineStatus = useEngineStore((s) => s.setStatus)

  const setMediaPage = useLibraryStore((s) => s.setItems)
  const selectSingle = useLibraryStore((s) => s.selectSingle)
  const setGenerations = useGenerationStore((s) => s.setGenerations)
  const setPrompt = useGenerationStore((s) => s.setPrompt)
  const addRefImagePath = useGenerationStore((s) => s.addRefImagePath)
  const clearRefImages = useGenerationStore((s) => s.clearRefImages)

  const setQueueItems = useQueueStore((s) => s.setItems)
  const startTimer = useQueueStore((s) => s.startTimer)
  const setActiveProgress = useQueueStore((s) => s.setActiveProgress)

  // Subscribe to engine status events
  useEffect(() => {
    // Phase 3 prototype: provide a stable mock status immediately.
    setEngineStatus(createMockEngineStatus())

    const unsubscribe = window.api.on('engine:status', (status: unknown) => {
      setEngineStatus(status as EngineStatus)
    })

    return unsubscribe
  }, [setEngineStatus])

  // Hydrate initial state
  useEffect(() => {
    window.api.getEngineStatus().then(setEngineStatus).catch(() => {
      setEngineStatus(createMockEngineStatus())
    })
  }, [setEngineStatus])

  // Phase 3 prototype: seed mock UI data (grid, timeline, queue/progress).
  useEffect(() => {
    const mockPage = createMockMediaPage(96)
    setMediaPage(mockPage)
    if (mockPage.items[0]) selectSingle(mockPage.items[0].id)

    const mockGenerations = createMockGenerations(24)
    setGenerations(mockGenerations)

    clearRefImages()
    addRefImagePath('mock://ref-1')
    addRefImagePath('mock://ref-2')
    setPrompt('A cinematic portrait photo, rim lighting, shallow depth of field')

    const mockQueue = createMockQueueItems()
    setQueueItems(mockQueue)
    startTimer(mockQueue[0]!.id)
    setActiveProgress(mockQueue[0]!.id, 'Sampling', 2, 4)
  }, [
    addRefImagePath,
    clearRefImages,
    selectSingle,
    setActiveProgress,
    setGenerations,
    setMediaPage,
    setPrompt,
    setQueueItems,
    startTimer
  ])

  // Keep mock elapsed time ticking for the status bar.
  useEffect(() => {
    const id = window.setInterval(() => {
      setActiveProgress('mock-queue-0001', 'Sampling', 2, 4)
    }, 250)
    return () => window.clearInterval(id)
  }, [setActiveProgress])

  return <AppLayout />
}

export default App
