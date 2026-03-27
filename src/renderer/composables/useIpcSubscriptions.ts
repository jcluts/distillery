import { onBeforeUnmount, onMounted } from 'vue'

import type { EngineStatus, ImportScanProgress } from '@/types'
import { useCollectionStore } from '@/stores/collection'
import { useEngineStore } from '@/stores/engine'
import { useImportFolderStore } from '@/stores/import-folder'
import { useLibraryStore } from '@/stores/library'
import { useUIStore } from '@/stores/ui'

export function useIpcSubscriptions(): void {
  const collectionStore = useCollectionStore()
  const engineStore = useEngineStore()
  const importFolderStore = useImportFolderStore()
  const libraryStore = useLibraryStore()
  const uiStore = useUIStore()
  const unsubs: Array<() => void> = []

  onMounted(async () => {
    await Promise.all([
      libraryStore.loadMedia(),
      collectionStore.loadCollections(),
      importFolderStore.loadFolders(),
      engineStore.loadStatus(),
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
  })

  onBeforeUnmount(() => {
    while (unsubs.length > 0) {
      const dispose = unsubs.pop()
      dispose?.()
    }
  })
}
