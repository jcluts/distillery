import * as React from 'react'

import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { SectionLabel } from '@/components/ui/section-label'
import { useModelStore } from '@/stores/model-store'
import { useProviderStore } from '@/stores/provider-store'
import { useModelBrowsingStore } from '@/stores/model-browsing-store'
import { useGenerationStore } from '@/stores/generation-store'
import { useUIStore } from '@/stores/ui-store'
import type { CanonicalEndpointDef, ModelIdentity } from '@/types'

const MANAGE_MODELS_VALUE = '__manage_models__'
const MANAGE_PROVIDERS_VALUE = '__manage_providers__'

/**
 * A unified provider entry — either local or remote.
 */
interface ProviderOption {
  label: string
  endpointKey: string
  providerId: string
  providerModelId: string
  isLocal: boolean
  isReady: boolean
}

export function ModelSelector(): React.JSX.Element {
  const filesByModelId = useModelStore((s) => s.filesByModelId)
  const setActiveModel = useModelStore((s) => s.setActiveModel)

  const providers = useProviderStore((s) => s.providers)
  const loadProviders = useProviderStore((s) => s.loadProviders)
  const identities = useModelBrowsingStore((s) => s.identities)
  const loadAllUserModels = useModelBrowsingStore((s) => s.loadAllUserModels)
  const loadIdentities = useModelBrowsingStore((s) => s.loadIdentities)
  const catalogVersion = useModelBrowsingStore((s) => s.catalogVersion)

  const endpointKey = useGenerationStore((s) => s.endpointKey)
  const setEndpointKey = useGenerationStore((s) => s.setEndpointKey)
  const generationMode = useGenerationStore((s) => s.generationMode)

  const openModal = useUIStore((s) => s.openModal)

  const [endpoints, setEndpoints] = React.useState<CanonicalEndpointDef[]>([])

  // Load endpoints and provider data on mount; re-fetch endpoints when user models change
  React.useEffect(() => {
    window.api
      .listGenerationEndpoints()
      .then(setEndpoints)
      .catch(() => {})
  }, [catalogVersion])

  React.useEffect(() => {
    void loadProviders().then(() => void loadAllUserModels())
    void loadIdentities()
  }, [loadProviders, loadAllUserModels, loadIdentities])

  // Filter endpoints to only those supporting the active generation mode
  const modeEndpoints = React.useMemo(
    () => endpoints.filter((ep) => ep.modes.includes(generationMode)),
    [endpoints, generationMode]
  )

  const providerDisplayNames = React.useMemo(
    () =>
      Object.fromEntries(
        providers.map((provider) => [provider.providerId, provider.displayName ?? provider.providerId])
      ),
    [providers]
  )

  const identityMap = React.useMemo(() => {
    const map = new Map<string, { identity: ModelIdentity; providerOptions: ProviderOption[] }>()

    for (const endpoint of modeEndpoints) {
      const isLocal = endpoint.providerId === 'local'
      const isReady = isLocal ? (filesByModelId[endpoint.providerModelId]?.isReady ?? false) : true
      const identityId = endpoint.canonicalModelId ?? `${endpoint.providerId}-${endpoint.providerModelId}`
      const identity =
        identities.find((entry) => entry.id === identityId) ??
        identities.find((entry) =>
          entry.providerMapping?.[endpoint.providerId]?.includes(endpoint.providerModelId)
        )
      const resolvedIdentityId = identity?.id ?? identityId
      const label = isLocal ? 'Local (cn-engine)' : (providerDisplayNames[endpoint.providerId] ?? endpoint.providerId)

      if (!map.has(resolvedIdentityId)) {
        map.set(resolvedIdentityId, {
          identity: identity ?? {
            id: resolvedIdentityId,
            name: endpoint.displayName,
            providerMapping: {}
          },
          providerOptions: []
        })
      }

      map.get(resolvedIdentityId)!.providerOptions.push({
        label,
        endpointKey: endpoint.endpointKey,
        providerId: endpoint.providerId,
        providerModelId: endpoint.providerModelId,
        isLocal,
        isReady
      })
    }

    return map
  }, [modeEndpoints, filesByModelId, identities, providerDisplayNames])

  // Find currently selected identity and provider from endpointKey
  const currentEntry = React.useMemo(() => {
    for (const [, entry] of identityMap) {
      const match = entry.providerOptions.find((p) => p.endpointKey === endpointKey)
      if (match) return { identity: entry.identity, provider: match, entry }
    }
    return null
  }, [identityMap, endpointKey])

  // Available identities as sorted array
  const identityEntries = React.useMemo(
    () =>
      Array.from(identityMap.entries())
        .map(([id, entry]) => ({ id, ...entry }))
        .sort((a, b) => a.identity.name.localeCompare(b.identity.name)),
    [identityMap]
  )

  // Provider options for the currently selected identity
  const currentProviderOptions = currentEntry?.entry.providerOptions ?? []

  // Auto-select an endpoint when the generation mode changes and the current
  // endpoint doesn't support the new mode (currentEntry becomes null).
  React.useEffect(() => {
    if (currentEntry || identityEntries.length === 0) return

    // Pick the first identity with a ready provider option, fall back to first available
    const firstReady = identityEntries.find((e) => e.providerOptions.some((p) => p.isReady))
    const fallback = firstReady ?? identityEntries[0]
    if (!fallback) return

    const local = fallback.providerOptions.find((p) => p.isLocal && p.isReady)
    const first = fallback.providerOptions[0]
    const chosen = local ?? first
    if (chosen) {
      setEndpointKey(chosen.endpointKey)
      if (chosen.isLocal) void setActiveModel(chosen.providerModelId)
    }
  }, [currentEntry, identityEntries, setEndpointKey, setActiveModel])

  // When model identity changes, pick the first available provider
  const handleModelChange = (identityId: string): void => {
    if (identityId === MANAGE_MODELS_VALUE) {
      openModal('models')
      return
    }

    const entry = identityMap.get(identityId)
    if (!entry) return

    // Prefer local if ready, otherwise first available
    const local = entry.providerOptions.find((p) => p.isLocal && p.isReady)
    const first = entry.providerOptions[0]
    const chosen = local ?? first
    if (chosen) {
      setEndpointKey(chosen.endpointKey)
      if (chosen.isLocal) void setActiveModel(chosen.providerModelId)
    }
  }

  const handleProviderChange = (newEndpointKey: string): void => {
    if (newEndpointKey === MANAGE_PROVIDERS_VALUE) {
      openModal('providers')
      return
    }
    setEndpointKey(newEndpointKey)

    // If switching to local, set active model from the provider option
    const option = currentProviderOptions.find((p) => p.endpointKey === newEndpointKey)
    if (option?.isLocal) {
      void setActiveModel(option.providerModelId)
    }
  }

  return (
    <div className="space-y-2">
      {/* Model selector */}
      <SectionLabel>Model</SectionLabel>
      <Select value={currentEntry?.identity.id ?? ''} onValueChange={handleModelChange}>
        <SelectTrigger className="w-full">
          <SelectValue placeholder="Select model" />
        </SelectTrigger>
        <SelectContent>
          {identityEntries.map((entry) => {
            const hasReadyOption = entry.providerOptions.some((p) => p.isReady)
            return (
              <SelectItem key={entry.id} value={entry.id}>
                {entry.identity.name}
                {!hasReadyOption ? ' (Setup Required)' : ''}
              </SelectItem>
            )
          })}
          <SelectSeparator />
          <SelectItem value={MANAGE_MODELS_VALUE}>Manage Models…</SelectItem>
        </SelectContent>
      </Select>

      {/* Provider selector — only show when there are multiple provider options */}
      {currentProviderOptions.length > 1 && (
        <>
          <SectionLabel>Provider</SectionLabel>
          <Select value={endpointKey} onValueChange={handleProviderChange}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select provider" />
            </SelectTrigger>
            <SelectContent>
              {currentProviderOptions.map((option) => (
                <SelectItem key={option.endpointKey} value={option.endpointKey}>
                  {option.label}
                  {!option.isReady ? ' (Setup Required)' : ''}
                </SelectItem>
              ))}
              <SelectSeparator />
              <SelectItem value={MANAGE_PROVIDERS_VALUE}>Manage Providers…</SelectItem>
            </SelectContent>
          </Select>
        </>
      )}

      {/* When only one provider, show a subtle link to manage if API providers exist */}
      {currentProviderOptions.length <= 1 &&
        providers.some((p) => p.executionMode === 'remote-async') && (
          <button
            type="button"
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => openModal('providers')}
          >
            Manage API Providers…
          </button>
        )}
    </div>
  )
}
