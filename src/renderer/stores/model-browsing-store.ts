import { create } from 'zustand'
import type { ModelIdentity, ProviderModel, SearchResult } from '../types'

declare const window: Window & { api: import('../types').DistilleryAPI }

interface ModelBrowsingState {
  userModelsByProvider: Record<string, ProviderModel[]>
  identities: ModelIdentity[]
  catalogVersion: number

  searchResults: Record<string, SearchResult>
  searchLoading: Record<string, boolean>
  listCache: Record<string, ProviderModel[]>
  listLoading: Record<string, boolean>

  loadUserModels: (providerId: string) => Promise<void>
  loadAllUserModels: () => Promise<void>
  loadIdentities: () => Promise<void>

  searchModels: (providerId: string, query: string) => Promise<void>
  listModels: (providerId: string) => Promise<void>

  addUserModel: (providerId: string, model: ProviderModel) => Promise<void>
  removeUserModel: (providerId: string, modelId: string) => Promise<void>
  setModelIdentity: (providerId: string, modelId: string, identityId: string) => Promise<void>
}

export const useModelBrowsingStore = create<ModelBrowsingState>((set, get) => ({
  userModelsByProvider: {},
  identities: [],
  catalogVersion: 0,
  searchResults: {},
  searchLoading: {},
  listCache: {},
  listLoading: {},

  loadUserModels: async (providerId) => {
    try {
      const models = await window.api.providers.getUserModels(providerId)
      set((state) => ({
        userModelsByProvider: { ...state.userModelsByProvider, [providerId]: models }
      }))
    } catch {
      // ignore
    }
  },

  loadAllUserModels: async () => {
    try {
      const providers = await window.api.providers.getAll()
      const apiProviders = providers.filter((provider) => provider.executionMode === 'remote-async')
      await Promise.all(apiProviders.map((provider) => get().loadUserModels(provider.providerId)))
    } catch {
      // ignore
    }
  },

  loadIdentities: async () => {
    try {
      const identities = await window.api.identities.getAll()
      set({ identities })
    } catch {
      // ignore
    }
  },

  searchModels: async (providerId, query) => {
    set((state) => ({
      searchLoading: { ...state.searchLoading, [providerId]: true }
    }))
    try {
      const results = await window.api.providers.searchModels(providerId, query)
      set((state) => ({
        searchResults: { ...state.searchResults, [providerId]: results },
        searchLoading: { ...state.searchLoading, [providerId]: false }
      }))
    } catch {
      set((state) => ({
        searchResults: { ...state.searchResults, [providerId]: { models: [] } },
        searchLoading: { ...state.searchLoading, [providerId]: false }
      }))
    }
  },

  listModels: async (providerId) => {
    if (get().listCache[providerId]) return

    set((state) => ({
      listLoading: { ...state.listLoading, [providerId]: true }
    }))
    try {
      const models = await window.api.providers.listModels(providerId)
      set((state) => ({
        listCache: { ...state.listCache, [providerId]: models },
        listLoading: { ...state.listLoading, [providerId]: false }
      }))
    } catch {
      set((state) => ({
        listCache: { ...state.listCache, [providerId]: [] },
        listLoading: { ...state.listLoading, [providerId]: false }
      }))
    }
  },

  addUserModel: async (providerId, model) => {
    await window.api.providers.addUserModel(providerId, model)
    set((state) => {
      const existing = state.userModelsByProvider[providerId] ?? []
      if (existing.some((entry) => entry.modelId === model.modelId)) return state
      return {
        catalogVersion: state.catalogVersion + 1,
        userModelsByProvider: {
          ...state.userModelsByProvider,
          [providerId]: [...existing, model]
        }
      }
    })
  },

  removeUserModel: async (providerId, modelId) => {
    await window.api.providers.removeUserModel(providerId, modelId)
    set((state) => ({
      catalogVersion: state.catalogVersion + 1,
      userModelsByProvider: {
        ...state.userModelsByProvider,
        [providerId]: (state.userModelsByProvider[providerId] ?? []).filter(
          (entry) => entry.modelId !== modelId
        )
      }
    }))
  },

  setModelIdentity: async (providerId, modelId, identityId) => {
    try {
      await window.api.identities.addMapping(identityId, providerId, [modelId])
      await get().loadIdentities()
      set((state) => ({
        userModelsByProvider: {
          ...state.userModelsByProvider,
          [providerId]: (state.userModelsByProvider[providerId] ?? []).map((model) =>
            model.modelId === modelId ? { ...model, modelIdentityId: identityId } : model
          )
        }
      }))
    } catch {
      // ignore
    }
  }
}))
