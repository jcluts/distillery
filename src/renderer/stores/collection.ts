import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import type { CollectionCreate, CollectionRecord, CollectionUpdate } from '@/types'

const DEFAULT_COLLECTION_ID = 'special-all'

export const useCollectionStore = defineStore('collection', () => {
  const collections = ref<CollectionRecord[]>([])
  const activeCollectionId = ref(DEFAULT_COLLECTION_ID)
  const editingCollectionId = ref<string | null>(null)

  const specialCollections = computed(() =>
    collections.value.filter((c) => c.type === 'special')
  )

  const manualCollections = computed(() =>
    collections.value.filter((c) => c.type !== 'special')
  )

  async function loadCollections(): Promise<void> {
    const result = await window.api.collections.getAll()
    collections.value = result

    const hasActive = result.some((c) => c.id === activeCollectionId.value)
    if (!hasActive) {
      activeCollectionId.value = DEFAULT_COLLECTION_ID
    }
  }

  function setActiveCollection(id: string): void {
    activeCollectionId.value = id
  }

  function setEditingCollectionId(id: string | null): void {
    editingCollectionId.value = id
  }

  async function createCollection(data: CollectionCreate): Promise<CollectionRecord> {
    const created = await window.api.collections.create(data)
    await loadCollections()
    activeCollectionId.value = created.id
    return created
  }

  async function updateCollection(id: string, data: CollectionUpdate): Promise<void> {
    await window.api.collections.update(id, data)
    await loadCollections()
  }

  async function deleteCollection(id: string): Promise<void> {
    if (activeCollectionId.value === id) {
      activeCollectionId.value = DEFAULT_COLLECTION_ID
    }
    await window.api.collections.delete(id)
    await loadCollections()
  }

  function reorderCollections(orderedIds: string[]): void {
    const indexById = new Map(orderedIds.map((id, i) => [id, i]))
    const special = collections.value.filter((c) => c.type === 'special')
    const manual = collections.value
      .filter((c) => c.type !== 'special')
      .slice()
      .sort((a, b) => {
        const ai = indexById.get(a.id) ?? Number.MAX_SAFE_INTEGER
        const bi = indexById.get(b.id) ?? Number.MAX_SAFE_INTEGER
        return ai - bi
      })

    collections.value = [...special, ...manual]

    window.api.collections.reorder(orderedIds).catch(() => {
      void loadCollections()
    })
  }

  async function addMediaToCollection(collectionId: string, mediaIds: string[]): Promise<void> {
    if (mediaIds.length === 0) return
    await window.api.collections.addMedia(collectionId, mediaIds)
    await loadCollections()
  }

  async function removeMediaFromCollection(
    collectionId: string,
    mediaIds: string[]
  ): Promise<void> {
    if (mediaIds.length === 0) return
    await window.api.collections.removeMedia(collectionId, mediaIds)
    await loadCollections()
  }

  return {
    collections,
    activeCollectionId,
    editingCollectionId,
    specialCollections,
    manualCollections,
    loadCollections,
    setActiveCollection,
    setEditingCollectionId,
    createCollection,
    updateCollection,
    deleteCollection,
    reorderCollections,
    addMediaToCollection,
    removeMediaFromCollection
  }
})
