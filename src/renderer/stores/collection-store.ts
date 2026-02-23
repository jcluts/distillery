import { create } from 'zustand'

import type {
  CollectionCreate,
  CollectionRecord,
  CollectionUpdate
} from '@/types'

interface CollectionState {
  collections: CollectionRecord[]
  activeCollectionId: string
  editingCollectionId: string | null

  loadCollections: () => Promise<void>
  setActiveCollection: (id: string) => void
  setEditingCollectionId: (id: string | null) => void
  createCollection: (data: CollectionCreate) => Promise<CollectionRecord>
  updateCollection: (id: string, data: CollectionUpdate) => Promise<void>
  deleteCollection: (id: string) => Promise<void>
  reorderCollections: (orderedIds: string[]) => void
  addMediaToCollection: (collectionId: string, mediaIds: string[]) => Promise<void>
  removeMediaFromCollection: (collectionId: string, mediaIds: string[]) => Promise<void>
}

const DEFAULT_COLLECTION_ID = 'special-all'

export const useCollectionStore = create<CollectionState>((set, get) => ({
  collections: [],
  activeCollectionId: DEFAULT_COLLECTION_ID,
  editingCollectionId: null,

  loadCollections: async () => {
    const collections = await window.api.collections.getAll()
    set((state) => {
      const hasActive = collections.some((collection) => collection.id === state.activeCollectionId)
      return {
        collections,
        activeCollectionId: hasActive ? state.activeCollectionId : DEFAULT_COLLECTION_ID
      }
    })
  },

  setActiveCollection: (id) => {
    set({ activeCollectionId: id })
  },

  setEditingCollectionId: (id) => {
    set({ editingCollectionId: id })
  },

  createCollection: async (data) => {
    const created = await window.api.collections.create(data)
    await get().loadCollections()
    set({ activeCollectionId: created.id })
    return created
  },

  updateCollection: async (id, data) => {
    await window.api.collections.update(id, data)
    await get().loadCollections()
  },

  deleteCollection: async (id) => {
    await window.api.collections.delete(id)
    set((state) => ({
      activeCollectionId: state.activeCollectionId === id ? DEFAULT_COLLECTION_ID : state.activeCollectionId
    }))
    await get().loadCollections()
  },

  reorderCollections: (orderedIds) => {
    const indexById = new Map<string, number>(orderedIds.map((id, index) => [id, index]))
    set((state) => {
      const special = state.collections.filter((collection) => collection.type === 'special')
      const manual = state.collections
        .filter((collection) => collection.type !== 'special')
        .slice()
        .sort((a, b) => {
          const aIndex = indexById.get(a.id) ?? Number.MAX_SAFE_INTEGER
          const bIndex = indexById.get(b.id) ?? Number.MAX_SAFE_INTEGER
          return aIndex - bIndex
        })

      return { collections: [...special, ...manual] }
    })

    void window.api.collections.reorder(orderedIds).catch(() => {
      void get().loadCollections()
    })
  },

  addMediaToCollection: async (collectionId, mediaIds) => {
    if (mediaIds.length === 0) return
    await window.api.collections.addMedia(collectionId, mediaIds)
    await get().loadCollections()
  },

  removeMediaFromCollection: async (collectionId, mediaIds) => {
    if (mediaIds.length === 0) return
    await window.api.collections.removeMedia(collectionId, mediaIds)
    await get().loadCollections()
  }
}))
