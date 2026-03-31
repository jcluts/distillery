import { defineStore } from 'pinia'
import { ref } from 'vue'

import type { ModelIdentity, ProviderModel, SearchResult } from '@/types'

export const useModelBrowsingStore = defineStore('model-browsing', () => {
  const userModelsByProvider = ref<Record<string, ProviderModel[]>>({})
  const identities = ref<ModelIdentity[]>([])
  const catalogVersion = ref(0)

  const searchResults = ref<Record<string, SearchResult>>({})
  const searchLoading = ref<Record<string, boolean>>({})
  const listCache = ref<Record<string, ProviderModel[]>>({})
  const listLoading = ref<Record<string, boolean>>({})

  async function loadUserModels(providerId: string): Promise<void> {
    try {
      const models = await window.api.providers.getUserModels(providerId)
      userModelsByProvider.value = { ...userModelsByProvider.value, [providerId]: models }
    } catch {
      // ignore
    }
  }

  async function loadAllUserModels(): Promise<void> {
    try {
      const providers = await window.api.providers.getAll()
      const apiProviders = providers.filter((p) => p.executionMode === 'remote-async')
      await Promise.all(apiProviders.map((p) => loadUserModels(p.providerId)))
    } catch {
      // ignore
    }
  }

  async function loadIdentities(): Promise<void> {
    try {
      identities.value = await window.api.identities.getAll()
    } catch {
      // ignore
    }
  }

  async function searchModels(providerId: string, query: string): Promise<void> {
    searchLoading.value = { ...searchLoading.value, [providerId]: true }
    try {
      const results = await window.api.providers.searchModels(providerId, query)
      searchResults.value = { ...searchResults.value, [providerId]: results }
    } catch {
      searchResults.value = { ...searchResults.value, [providerId]: { models: [] } }
    } finally {
      searchLoading.value = { ...searchLoading.value, [providerId]: false }
    }
  }

  async function listModels(providerId: string): Promise<void> {
    if (listCache.value[providerId]) return
    listLoading.value = { ...listLoading.value, [providerId]: true }
    try {
      const models = await window.api.providers.listModels(providerId)
      listCache.value = { ...listCache.value, [providerId]: models }
    } catch {
      listCache.value = { ...listCache.value, [providerId]: [] }
    } finally {
      listLoading.value = { ...listLoading.value, [providerId]: false }
    }
  }

  async function addUserModel(providerId: string, model: ProviderModel): Promise<void> {
    await window.api.providers.addUserModel(providerId, model)
    const existing = userModelsByProvider.value[providerId] ?? []
    if (existing.some((e) => e.modelId === model.modelId)) return
    catalogVersion.value++
    userModelsByProvider.value = {
      ...userModelsByProvider.value,
      [providerId]: [...existing, model]
    }
  }

  async function removeUserModel(providerId: string, modelId: string): Promise<void> {
    await window.api.providers.removeUserModel(providerId, modelId)
    catalogVersion.value++
    userModelsByProvider.value = {
      ...userModelsByProvider.value,
      [providerId]: (userModelsByProvider.value[providerId] ?? []).filter(
        (e) => e.modelId !== modelId
      )
    }
  }

  async function setModelIdentity(providerId: string, modelId: string, identityId: string): Promise<void> {
    try {
      await window.api.identities.addMapping(identityId, providerId, [modelId])
      await loadIdentities()
      userModelsByProvider.value = {
        ...userModelsByProvider.value,
        [providerId]: (userModelsByProvider.value[providerId] ?? []).map((model) =>
          model.modelId === modelId ? { ...model, modelIdentityId: identityId } : model
        )
      }
    } catch {
      // ignore
    }
  }

  return {
    userModelsByProvider,
    identities,
    catalogVersion,
    searchResults,
    searchLoading,
    listCache,
    listLoading,

    loadUserModels,
    loadAllUserModels,
    loadIdentities,
    searchModels,
    listModels,
    addUserModel,
    removeUserModel,
    setModelIdentity
  }
})
