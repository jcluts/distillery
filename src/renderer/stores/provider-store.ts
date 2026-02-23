import { create } from 'zustand'
import type { ProviderConfig } from '../types'

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
  providers: ProviderConfig[]
  selectedProviderId: string | null
  connectionStatus: Record<string, ConnectionInfo>
  hasApiKey: Record<string, boolean>

  loadProviders: () => Promise<void>
  selectProvider: (id: string) => void
  testConnection: (providerId: string) => Promise<void>
  checkApiKeyPresence: (providerId: string) => Promise<void>
  checkAllApiKeyPresence: () => Promise<void>
  getSelectedProvider: () => ProviderConfig | null
  getApiProviders: () => ProviderConfig[]
}

export const useProviderStore = create<ProviderState>((set, get) => ({
  providers: [],
  selectedProviderId: null,
  connectionStatus: {},
  hasApiKey: {},

  loadProviders: async () => {
    try {
      const providers = await window.api.providers.getAll()
      set({ providers })
      const state = get()
      if (!state.selectedProviderId) {
        const apiProviders = providers.filter((p) => p.executionMode === 'remote-async')
        if (apiProviders[0]) {
          set({ selectedProviderId: apiProviders[0].providerId })
        }
      }
      await get().checkAllApiKeyPresence()
    } catch {
      // ignore
    }
  },

  selectProvider: (id) => set({ selectedProviderId: id }),

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
    const apiProviders = state.providers.filter((p) => p.executionMode === 'remote-async')
    await Promise.all(apiProviders.map((p) => get().checkApiKeyPresence(p.providerId)))
  },

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

  getSelectedProvider: () => {
    const state = get()
    return state.providers.find((p) => p.providerId === state.selectedProviderId) ?? null
  },

  getApiProviders: () => {
    return get().providers.filter((p) => p.executionMode === 'remote-async')
  }
}))
