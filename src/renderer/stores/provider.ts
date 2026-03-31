import { defineStore } from 'pinia'
import { ref } from 'vue'

import type { ProviderConfig } from '@/types'

export type ConnectionStatus = 'idle' | 'testing' | 'success' | 'error'

interface ConnectionInfo {
  status: ConnectionStatus
  message?: string
}

export const useProviderStore = defineStore('provider', () => {
  const providers = ref<ProviderConfig[]>([])
  const selectedProviderId = ref<string | null>(null)
  const connectionStatus = ref<Record<string, ConnectionInfo>>({})
  const hasApiKey = ref<Record<string, boolean>>({})

  async function loadProviders(): Promise<void> {
    try {
      providers.value = await window.api.providers.getAll()
      if (!selectedProviderId.value) {
        const first = providers.value.find((p) => p.executionMode === 'remote-async')
        if (first) selectedProviderId.value = first.providerId
      }
      await checkAllApiKeyPresence()
    } catch {
      // ignore
    }
  }

  function selectProvider(id: string): void {
    selectedProviderId.value = id
  }

  async function checkApiKeyPresence(providerId: string): Promise<void> {
    const provider = providers.value.find((p) => p.providerId === providerId)
    const settingsKey = provider?.auth?.settingsKey
    if (!settingsKey) return
    try {
      const settings = await window.api.getSettings()
      const val = settings[settingsKey as keyof typeof settings]
      hasApiKey.value = { ...hasApiKey.value, [providerId]: typeof val === 'string' && val.length > 0 }
    } catch {
      // ignore
    }
  }

  async function checkAllApiKeyPresence(): Promise<void> {
    const apiProviders = providers.value.filter((p) => p.executionMode === 'remote-async')
    await Promise.all(apiProviders.map((p) => checkApiKeyPresence(p.providerId)))
  }

  async function testConnection(providerId: string): Promise<void> {
    connectionStatus.value = { ...connectionStatus.value, [providerId]: { status: 'testing' } }
    try {
      const result = await window.api.providers.testConnection(providerId)
      connectionStatus.value = {
        ...connectionStatus.value,
        [providerId]: { status: result.valid ? 'success' : 'error', message: result.error }
      }
    } catch (err) {
      connectionStatus.value = {
        ...connectionStatus.value,
        [providerId]: {
          status: 'error',
          message: err instanceof Error ? err.message : 'Connection failed'
        }
      }
    }
  }

  return {
    providers,
    selectedProviderId,
    connectionStatus,
    hasApiKey,
    loadProviders,
    selectProvider,
    testConnection,
    checkApiKeyPresence,
    checkAllApiKeyPresence
  }
})
