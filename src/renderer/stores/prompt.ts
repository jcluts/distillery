import { defineStore } from 'pinia'
import { ref } from 'vue'

import type {
  PromptCollectionCreate,
  PromptCollectionRecord,
  PromptCreate,
  PromptRecord,
  PromptUpdate
} from '@/types'

export const usePromptStore = defineStore('prompt', () => {
  const prompts = ref<PromptRecord[]>([])
  const collections = ref<PromptCollectionRecord[]>([])
  const loading = ref(false)

  const searchQuery = ref('')
  const collectionId = ref<string | null>(null)

  async function refreshPrompts(): Promise<void> {
    loading.value = true

    try {
      const trimmedQuery = searchQuery.value.trim()

      if (trimmedQuery) {
        const results = await window.api.prompts.search(trimmedQuery)
        prompts.value = collectionId.value
          ? results.filter((prompt) => prompt.collection_id === collectionId.value)
          : results
        return
      }

      if (collectionId.value) {
        prompts.value = await window.api.prompts.getByCollection(collectionId.value)
        return
      }

      prompts.value = await window.api.prompts.getAll()
    } finally {
      loading.value = false
    }
  }

  async function applyFilters(query: string, nextCollectionId: string | null): Promise<void> {
    searchQuery.value = query
    collectionId.value = nextCollectionId
    await refreshPrompts()
  }

  async function loadPrompts(): Promise<void> {
    await applyFilters('', null)
  }

  async function searchPrompts(query: string): Promise<void> {
    searchQuery.value = query
    await refreshPrompts()
  }

  async function loadByCollection(nextCollectionId: string | null): Promise<void> {
    collectionId.value = nextCollectionId
    await refreshPrompts()
  }

  async function createPrompt(data: PromptCreate): Promise<PromptRecord> {
    const created = await window.api.prompts.create(data)
    await Promise.all([refreshPrompts(), loadCollections()])
    return created
  }

  async function updatePrompt(id: string, data: PromptUpdate): Promise<PromptRecord | null> {
    const updated = await window.api.prompts.update(id, data)
    await Promise.all([refreshPrompts(), loadCollections()])
    return updated
  }

  async function deletePrompt(id: string): Promise<void> {
    await window.api.prompts.delete(id)
    await Promise.all([refreshPrompts(), loadCollections()])
  }

  async function incrementUse(id: string): Promise<void> {
    await window.api.prompts.incrementUse(id)
    await refreshPrompts()
  }

  async function setRating(id: string, rating: number): Promise<void> {
    await window.api.prompts.setRating(id, rating)
    await refreshPrompts()
  }

  async function loadCollections(): Promise<void> {
    collections.value = await window.api.prompts.collections.getAll()
  }

  async function createCollection(data: PromptCollectionCreate): Promise<PromptCollectionRecord> {
    const created = await window.api.prompts.collections.create(data)
    await loadCollections()
    return created
  }

  async function updateCollection(
    id: string,
    data: Partial<PromptCollectionCreate>
  ): Promise<PromptCollectionRecord | null> {
    const updated = await window.api.prompts.collections.update(id, data)
    await loadCollections()
    return updated
  }

  async function deleteCollection(id: string): Promise<void> {
    await window.api.prompts.collections.delete(id)

    if (collectionId.value === id) {
      collectionId.value = null
    }

    await Promise.all([loadCollections(), refreshPrompts()])
  }

  async function reorderCollections(orderedIds: string[]): Promise<void> {
    await window.api.prompts.collections.reorder(orderedIds)
    await loadCollections()
  }

  return {
    prompts,
    collections,
    loading,
    applyFilters,
    loadPrompts,
    searchPrompts,
    loadByCollection,
    createPrompt,
    updatePrompt,
    deletePrompt,
    incrementUse,
    setRating,
    loadCollections,
    createCollection,
    updateCollection,
    deleteCollection,
    reorderCollections
  }
})