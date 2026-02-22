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
  const userModelsByProvider = useProviderStore((s) => s.userModelsByProvider)
  const identities = useProviderStore((s) => s.identities)
  const loadProviders = useProviderStore((s) => s.loadProviders)
  const loadAllUserModels = useProviderStore((s) => s.loadAllUserModels)
  const loadIdentities = useProviderStore((s) => s.loadIdentities)
  const catalogVersion = useProviderStore((s) => s.catalogVersion)

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

  // Build the model identity map: identityId → { identity, providers[] }
  const identityMap = React.useMemo(() => {
    const map = new Map<string, { identity: ModelIdentity; providerOptions: ProviderOption[] }>()

    // Add local models from endpoints (local.json is the sole source of truth)
    const localEndpoints = modeEndpoints.filter((e) => e.providerId === 'local')
    for (const ep of localEndpoints) {
      const catalogModelId = ep.providerModelId
      const isReady = filesByModelId[catalogModelId]?.isReady ?? false

      // Find identity that maps this local model
      const identity = identities.find((id) => id.providerMapping?.local?.includes(catalogModelId))
      const identityId = identity?.id ?? `local-${catalogModelId}`

      if (!map.has(identityId)) {
        map.set(identityId, {
          identity: identity ?? {
            id: identityId,
            name: ep.displayName,
            providerMapping: {}
          },
          providerOptions: []
        })
      }

      map.get(identityId)!.providerOptions.push({
        label: 'Local (cn-engine)',
        endpointKey: ep.endpointKey,
        providerId: 'local',
        providerModelId: catalogModelId,
        isLocal: true,
        isReady
      })
    }

    // Add API provider models
    const apiProviders = providers.filter((p) => p.executionMode === 'remote-async')
    for (const provider of apiProviders) {
      const userModels = userModelsByProvider[provider.providerId] ?? []
      for (const model of userModels) {
        const identityId = model.modelIdentityId ?? `${provider.providerId}-${model.modelId}`

        // Find matching endpoint from catalog.
        const ep = modeEndpoints.find(
          (e) => e.providerId === provider.providerId && e.providerModelId === model.modelId
        )

        if (!ep) continue // Wait for endpoints to load or skip invalid models

        if (!map.has(identityId)) {
          const existingIdentity = identities.find((i) => i.id === identityId)
          map.set(identityId, {
            identity: existingIdentity ?? {
              id: identityId,
              name: model.name,
              providerMapping: {}
            },
            providerOptions: []
          })
        }

        map.get(identityId)!.providerOptions.push({
          label: provider.displayName ?? provider.providerId,
          endpointKey: ep.endpointKey,
          providerId: provider.providerId,
          providerModelId: model.modelId,
          isLocal: false,
          isReady: true // API models are always "ready" if key is configured
        })
      }
    }

    return map
  }, [modeEndpoints, filesByModelId, identities, providers, userModelsByProvider])

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
