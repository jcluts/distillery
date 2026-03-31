import { onBeforeUnmount, onMounted } from 'vue'

import type {
  EngineStatus,
  GenerationProgressEvent,
  GenerationResultEvent,
  ImportScanProgress,
  RemovalProgressEvent,
  RemovalResultEvent,
  UpscaleProgressEvent,
  UpscaleResultEvent,
  WorkQueueItem
} from '@/types'
import { useCollectionStore } from '@/stores/collection'
import { useEngineStore } from '@/stores/engine'
import { useGenerationStore } from '@/stores/generation'
import { useImportFolderStore } from '@/stores/import-folder'
import { useLibraryStore } from '@/stores/library'
import { useQueueStore } from '@/stores/queue'
import { useRemovalStore } from '@/stores/removal'
import { useUpscaleStore } from '@/stores/upscale'
import { useUIStore } from '@/stores/ui'

export function useIpcSubscriptions(): void {
  const collectionStore = useCollectionStore()
  const engineStore = useEngineStore()
  const generationStore = useGenerationStore()
  const importFolderStore = useImportFolderStore()
  const libraryStore = useLibraryStore()
  const queueStore = useQueueStore()
  const removalStore = useRemovalStore()
  const upscaleStore = useUpscaleStore()
  const uiStore = useUIStore()
  const unsubs: Array<() => void> = []

  onMounted(async () => {
    await Promise.all([
      libraryStore.loadMedia(),
      collectionStore.loadCollections(),
      importFolderStore.loadFolders(),
      engineStore.loadStatus(),
      queueStore.loadQueue(),
      generationStore.loadTimeline(),
      window.api.getSettings().then((settings) => uiStore.applySettings(settings))
    ])

    unsubs.push(
      window.api.on('engine:status', (payload: unknown) => {
        engineStore.setStatus(payload as EngineStatus)
      })
    )

    unsubs.push(
      window.api.on('library:updated', () => {
        void libraryStore.loadMedia()
      })
    )

    unsubs.push(
      window.api.on('collections:updated', () => {
        void collectionStore.loadCollections()
      })
    )

    unsubs.push(
      window.api.on('importFolders:updated', () => {
        void importFolderStore.loadFolders()
      })
    )

    unsubs.push(
      window.api.on('importFolders:scanProgress', (payload: unknown) => {
        const progress = payload as ImportScanProgress
        if (!progress?.folder_id) return
        importFolderStore.setScanProgress(progress)
      })
    )

    unsubs.push(
      window.api.on('removal:progress', (payload: unknown) => {
        removalStore.handleProgress(payload as RemovalProgressEvent)
      })
    )

    unsubs.push(
      window.api.on('removal:result', (payload: unknown) => {
        void removalStore.handleResult(payload as RemovalResultEvent)
      })
    )

    unsubs.push(
      window.api.on('upscale:progress', (payload: unknown) => {
        upscaleStore.handleProgress(payload as UpscaleProgressEvent)
      })
    )

    unsubs.push(
      window.api.on('upscale:result', (payload: unknown) => {
        upscaleStore.handleResult(payload as UpscaleResultEvent)
        void libraryStore.loadMedia()
      })
    )

    unsubs.push(
      window.api.on('queue:updated', (payload: unknown) => {
        queueStore.syncFromQueueUpdate((payload as WorkQueueItem[]) ?? [])
      })
    )

    unsubs.push(
      window.api.on('generation:progress', (payload: unknown) => {
        queueStore.handleProgressEvent(payload as GenerationProgressEvent)
      })
    )

    unsubs.push(
      window.api.on('generation:result', (payload: unknown) => {
        const evt = payload as GenerationResultEvent
        if (!evt?.generationId) return
        void queueStore.loadQueue()
        void libraryStore.loadMedia()
        void generationStore.loadTimeline()
      })
    )
  })

  onBeforeUnmount(() => {
    while (unsubs.length > 0) {
      const dispose = unsubs.pop()
      dispose?.()
    }
  })
}
