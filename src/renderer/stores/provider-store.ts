import { create } from 'zustand'
import type { ModelIdentity, ProviderConfig, ProviderModel, SearchResult } from '../types'

// =============================================================================
// Provider Store
// Provider manager state: configs, user models, identities, connection status.
// =============================================================================

declare const window: Window & { api: import('../types').DistilleryAPI }

export type ConnectionStatus = 'idle' | 'testing' | 'success' | 'error'

interface ConnectionInfo {
  status: ConnectionStatus
  message?: string
}

interface ProviderState {
  // Data
  providers: ProviderConfig[]
  selectedProviderId: string | null
  userModelsByProvider: Record<string, ProviderModel[]>
  identities: ModelIdentity[]
  connectionStatus: Record<string, ConnectionInfo>

  // API key presence cache (populated from settings, keyed by providerId)
  hasApiKey: Record<string, boolean>

  // Increments when user models change so consumers can re-derive endpoint lists
  catalogVersion: number

  // Search / browse state
  searchResults: Record<string, SearchResult>
  searchLoading: Record<string, boolean>
  listCache: Record<string, ProviderModel[]>
  listLoading: Record<string, boolean>

  // Actions — data loading
  loadProviders: () => Promise<void>
  selectProvider: (id: string) => void
  loadUserModels: (providerId: string) => Promise<void>
  loadAllUserModels: () => Promise<void>
  loadIdentities: () => Promise<void>

  // Actions — connection
  testConnection: (providerId: string) => Promise<void>

  // Actions — API key
  checkApiKeyPresence: (providerId: string) => Promise<void>
  checkAllApiKeyPresence: () => Promise<void>

  // Actions — model browsing
  searchModels: (providerId: string, query: string) => Promise<void>
  listModels: (providerId: string) => Promise<void>

  // Actions — user model management
  addUserModel: (providerId: string, model: ProviderModel) => Promise<void>
  removeUserModel: (providerId: string, modelId: string) => Promise<void>

  // Actions — identity mapping
  setModelIdentity: (
    providerId: string,
    modelId: string,
    identityId: string
  ) => Promise<void>

  // Derived helpers
  getSelectedProvider: () => ProviderConfig | null
  getApiProviders: () => ProviderConfig[]
}

export const useProviderStore = create<ProviderState>((set, get) => ({
  providers: [],
  selectedProviderId: null,
  userModelsByProvider: {},
  identities: [],
  connectionStatus: {},
  hasApiKey: {},
  catalogVersion: 0,
  searchResults: {},
  searchLoading: {},
  listCache: {},
  listLoading: {},

  // ---------------------------------------------------------------------------
  // Data loading
  // ---------------------------------------------------------------------------

  loadProviders: async () => {
    try {
      const providers = await window.api.providers.getAll()
      set({ providers })
      // Auto-select first API provider if none selected
      const state = get()
      if (!state.selectedProviderId) {
        const apiProviders = providers.filter((p) => p.mode === 'remote-async')
        if (apiProviders[0]) {
          set({ selectedProviderId: apiProviders[0].providerId })
        }
      }
      // Populate API key presence for all providers
      await get().checkAllApiKeyPresence()
    } catch {
      // ignore — providers not available
    }
  },

  selectProvider: (id) => set({ selectedProviderId: id }),

  loadUserModels: async (providerId) => {
    try {
      const models = await window.api.providers.getUserModels(providerId)
      set((s) => ({
        userModelsByProvider: { ...s.userModelsByProvider, [providerId]: models }
      }))
    } catch {
      // ignore
    }
  },

  loadAllUserModels: async () => {
    const state = get()
    const apiProviders = state.providers.filter((p) => p.mode === 'remote-async')
    await Promise.all(apiProviders.map((p) => get().loadUserModels(p.providerId)))
  },

  loadIdentities: async () => {
    try {
      const identities = await window.api.identities.getAll()
      set({ identities })
    } catch {
      // ignore
    }
  },

  // ---------------------------------------------------------------------------
  // API key presence
  // ---------------------------------------------------------------------------

  checkApiKeyPresence: async (providerId) => {
    try {
      const state = get()
      const provider = state.providers.find((p) => p.providerId === providerId)
      const settingsKey = provider?.auth?.settingsKey
      if (!settingsKey) return
      const settings = await window.api.getSettings()
      const val = settings[settingsKey as keyof typeof settings]
      const present = typeof val === 'string' && val.length > 0
      set((s) => ({ hasApiKey: { ...s.hasApiKey, [providerId]: present } }))
    } catch {
      // ignore
    }
  },

  checkAllApiKeyPresence: async () => {
    const state = get()
    const apiProviders = state.providers.filter((p) => p.mode === 'remote-async')
    await Promise.all(apiProviders.map((p) => get().checkApiKeyPresence(p.providerId)))
  },

  // ---------------------------------------------------------------------------
  // Connection testing
  // ---------------------------------------------------------------------------

  testConnection: async (providerId) => {
    set((s) => ({
      connectionStatus: {
        ...s.connectionStatus,
        [providerId]: { status: 'testing' }
      }
    }))
    try {
      const result = await window.api.providers.testConnection(providerId)
      set((s) => ({
        connectionStatus: {
          ...s.connectionStatus,
          [providerId]: {
            status: result.valid ? 'success' : 'error',
            message: result.error
          }
        }
      }))
    } catch (err) {
      set((s) => ({
        connectionStatus: {
          ...s.connectionStatus,
          [providerId]: {
            status: 'error',
            message: err instanceof Error ? err.message : 'Connection failed'
          }
        }
      }))
    }
  },

  // ---------------------------------------------------------------------------
  // Model browsing
  // ---------------------------------------------------------------------------

  searchModels: async (providerId, query) => {
    set((s) => ({
      searchLoading: { ...s.searchLoading, [providerId]: true }
    }))
    try {
      const results = await window.api.providers.searchModels(providerId, query)
      set((s) => ({
        searchResults: { ...s.searchResults, [providerId]: results },
        searchLoading: { ...s.searchLoading, [providerId]: false }
      }))
    } catch {
      set((s) => ({
        searchResults: { ...s.searchResults, [providerId]: { models: [] } },
        searchLoading: { ...s.searchLoading, [providerId]: false }
      }))
    }
  },

  listModels: async (providerId) => {
    // Don't re-fetch if already cached
    if (get().listCache[providerId]) return

    set((s) => ({
      listLoading: { ...s.listLoading, [providerId]: true }
    }))
    try {
      const models = await window.api.providers.listModels(providerId)
      set((s) => ({
        listCache: { ...s.listCache, [providerId]: models },
        listLoading: { ...s.listLoading, [providerId]: false }
      }))
    } catch {
      set((s) => ({
        listCache: { ...s.listCache, [providerId]: [] },
        listLoading: { ...s.listLoading, [providerId]: false }
      }))
    }
  },

  // ---------------------------------------------------------------------------
  // User model management
  // ---------------------------------------------------------------------------

  addUserModel: async (providerId, model) => {
    await window.api.providers.addUserModel(providerId, model)
    // Optimistic update + bump catalog version so ModelSelector re-derives endpoints
    set((s) => {
      const existing = s.userModelsByProvider[providerId] ?? []
      if (existing.some((m) => m.modelId === model.modelId)) return s
      return {
        catalogVersion: s.catalogVersion + 1,
        userModelsByProvider: {
          ...s.userModelsByProvider,
          [providerId]: [...existing, model]
        }
      }
    })
  },

  removeUserModel: async (providerId, modelId) => {
    await window.api.providers.removeUserModel(providerId, modelId)
    // Optimistic update + bump catalog version
    set((s) => ({
      catalogVersion: s.catalogVersion + 1,
      userModelsByProvider: {
        ...s.userModelsByProvider,
        [providerId]: (s.userModelsByProvider[providerId] ?? []).filter(
          (m) => m.modelId !== modelId
        )
      }
    }))
  },

  // ---------------------------------------------------------------------------
  // Identity mapping
  // ---------------------------------------------------------------------------

  setModelIdentity: async (providerId, modelId, identityId) => {
    try {
      await window.api.identities.addMapping(identityId, providerId, [modelId])
      // Re-load identities to get updated mappings
      await get().loadIdentities()
      // Update the user model's identityId locally
      set((s) => ({
        userModelsByProvider: {
          ...s.userModelsByProvider,
          [providerId]: (s.userModelsByProvider[providerId] ?? []).map((m) =>
            m.modelId === modelId ? { ...m, modelIdentityId: identityId } : m
          )
        }
      }))
    } catch {
      // ignore
    }
  },

  // ---------------------------------------------------------------------------
  // Derived helpers
  // ---------------------------------------------------------------------------

  getSelectedProvider: () => {
    const state = get()
    return (
      state.providers.find((p) => p.providerId === state.selectedProviderId) ?? null
    )
  },

  getApiProviders: () => {
    return get().providers.filter((p) => p.mode === 'remote-async')
  }
}))
