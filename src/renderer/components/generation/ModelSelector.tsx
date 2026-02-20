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
  isLocal: boolean
  isReady: boolean
}

export function ModelSelector(): React.JSX.Element {
  const catalog = useModelStore((s) => s.catalog)
  const settings = useModelStore((s) => s.settings)
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

  const openModal = useUIStore((s) => s.openModal)

  const [endpoints, setEndpoints] = React.useState<CanonicalEndpointDef[]>([])

  // Load endpoints and provider data on mount; re-fetch endpoints when user models change
  React.useEffect(() => {
    window.api.listGenerationEndpoints().then(setEndpoints).catch(() => {})
  }, [catalogVersion])

  React.useEffect(() => {
    void loadProviders().then(() => void loadAllUserModels())
    void loadIdentities()
  }, [loadProviders, loadAllUserModels, loadIdentities])

  // Build the model identity map: identityId → { identity, providers[] }
  const identityMap = React.useMemo(() => {
    const map = new Map<
      string,
      { identity: ModelIdentity; providerOptions: ProviderOption[] }
    >()

    // Add local models as identity entries
    const localModels = (catalog?.models ?? []).filter((m) => m.type === 'image-generation')
    for (const model of localModels) {
      const isReady = filesByModelId[model.id]?.isReady ?? false
      // Find matching endpoint
      const ep =
        endpoints.find(
          (e) =>
            e.providerId === 'local' &&
            e.providerModelId.includes(model.id.replace(/-/g, ''))
        ) ?? endpoints.find((e) => e.providerId === 'local')

      // Find or create identity for this model
      const identity = identities.find((id) =>
        id.providerMapping?.local?.some((mid) =>
          mid.includes(model.id.replace(/-/g, ''))
        )
      )
      const identityId = identity?.id ?? `local-${model.id}`

      if (!map.has(identityId)) {
        map.set(identityId, {
          identity: identity ?? {
            id: identityId,
            name: model.name,
            providerMapping: {}
          },
          providerOptions: []
        })
      }

      map.get(identityId)!.providerOptions.push({
        label: 'Local (cn-engine)',
        endpointKey: ep?.endpointKey ?? 'local.flux2-klein.image',
        providerId: 'local',
        isLocal: true,
        isReady
      })
    }

    // Add API provider models
    const apiProviders = providers.filter((p) => p.mode === 'remote-async')
    for (const provider of apiProviders) {
      const userModels = userModelsByProvider[provider.providerId] ?? []
      for (const model of userModels) {
        const identityId = model.modelIdentityId ?? `${provider.providerId}-${model.modelId}`

        // Find matching endpoint from catalog. Fall back to canonical catalog format
        // (${providerId}.${modelId}.image) rather than a bare ID, to stay consistent
        // with what ProviderCatalogService.mapProviderUserModel generates.
        const ep = endpoints.find(
          (e) =>
            e.providerId === provider.providerId && e.providerModelId === model.modelId
        )

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
          endpointKey: ep?.endpointKey ?? `${provider.providerId}.${model.modelId}.image`,
          providerId: provider.providerId,
          isLocal: false,
          isReady: true // API models are always "ready" if key is configured
        })
      }
    }

    return map
  }, [catalog, endpoints, filesByModelId, identities, providers, userModelsByProvider])

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

      // If local, also set active model in model store
      if (chosen.isLocal) {
        const localModel = (catalog?.models ?? []).find((m) =>
          chosen.endpointKey.includes(m.id.replace(/-/g, ''))
        )
        if (localModel) void setActiveModel(localModel.id)
      }
    }
  }

  const handleProviderChange = (newEndpointKey: string): void => {
    if (newEndpointKey === MANAGE_PROVIDERS_VALUE) {
      openModal('providers')
      return
    }
    setEndpointKey(newEndpointKey)

    // If switching to local, ensure model is set
    const option = currentProviderOptions.find((p) => p.endpointKey === newEndpointKey)
    if (option?.isLocal) {
      const localModel = (catalog?.models ?? []).find((m) =>
        newEndpointKey.includes(m.id.replace(/-/g, ''))
      )
      if (localModel) void setActiveModel(localModel.id)
    }
  }

  const activeModelId = settings?.active_model_id ?? ''

  return (
    <div className="space-y-2">
      {/* Model selector */}
      <SectionLabel>Model</SectionLabel>
      <Select
        value={currentEntry?.identity.id ?? activeModelId}
        onValueChange={handleModelChange}
      >
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
        providers.some((p) => p.mode === 'remote-async') && (
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
