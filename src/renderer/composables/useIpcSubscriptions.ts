import { onBeforeUnmount, onMounted } from 'vue'

import type { EngineStatus } from '@/types'
import { useCollectionStore } from '@/stores/collection'
import { useEngineStore } from '@/stores/engine'
import { useLibraryStore } from '@/stores/library'
import { useUIStore } from '@/stores/ui'

export function useIpcSubscriptions(): void {
  const collectionStore = useCollectionStore()
  const engineStore = useEngineStore()
  const libraryStore = useLibraryStore()
  const uiStore = useUIStore()
  const unsubs: Array<() => void> = []

  onMounted(async () => {
    await Promise.all([
      libraryStore.loadMedia(),
      collectionStore.loadCollections(),
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
  })

  onBeforeUnmount(() => {
    while (unsubs.length > 0) {
      const dispose = unsubs.pop()
      dispose?.()
    }
  })
}
