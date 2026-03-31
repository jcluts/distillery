<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import Select from 'primevue/select'

import PaneSection from '@/components/panes/PaneSection.vue'
import { useModelStore } from '@/stores/model'
import { useProviderStore } from '@/stores/provider'
import { useModelBrowsingStore } from '@/stores/model-browsing'
import { useGenerationStore } from '@/stores/generation'
import type { CanonicalEndpointDef, ModelIdentity } from '@/types'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ProviderOption {
  label: string
  endpointKey: string
  providerId: string
  providerModelId: string
  isLocal: boolean
  isReady: boolean
}

interface IdentityEntry {
  id: string
  identity: ModelIdentity
  providerOptions: ProviderOption[]
}

// ---------------------------------------------------------------------------
// Stores
// ---------------------------------------------------------------------------

const modelStore = useModelStore()
const providerStore = useProviderStore()
const modelBrowsingStore = useModelBrowsingStore()
const generationStore = useGenerationStore()

const endpoints = ref<CanonicalEndpointDef[]>([])

// ---------------------------------------------------------------------------
// Load data
// ---------------------------------------------------------------------------

onMounted(async () => {
  await providerStore.loadProviders()
  await modelBrowsingStore.loadAllUserModels()
  await modelBrowsingStore.loadIdentities()
})

// Re-fetch endpoints when catalog version changes (user model added/removed)
watch(
  () => modelBrowsingStore.catalogVersion,
  async () => {
    try {
      endpoints.value = await window.api.listGenerationEndpoints()
    } catch {
      // ignore
    }
  },
  { immediate: true }
)

// ---------------------------------------------------------------------------
// Computed
// ---------------------------------------------------------------------------

const modeEndpoints = computed(() =>
  endpoints.value.filter((ep) => ep.modes.includes(generationStore.generationMode))
)

const providerDisplayNames = computed(() =>
  Object.fromEntries(
    providerStore.providers.map((p) => [p.providerId, p.displayName ?? p.providerId])
  )
)

const identityMap = computed(() => {
  const map = new Map<string, { identity: ModelIdentity; providerOptions: ProviderOption[] }>()

  for (const endpoint of modeEndpoints.value) {
    const isLocal = endpoint.providerId === 'local'
    const isReady = isLocal
      ? (modelStore.filesByModelId[endpoint.providerModelId]?.isReady ?? false)
      : true
    const identityId = endpoint.modelIdentityId ?? `${endpoint.providerId}-${endpoint.providerModelId}`
    const identity =
      modelBrowsingStore.identities.find((e) => e.id === identityId) ??
      modelBrowsingStore.identities.find((e) =>
        e.providerMapping?.[endpoint.providerId]?.includes(endpoint.providerModelId)
      )
    const resolvedId = identity?.id ?? identityId
    const label = isLocal
      ? 'Local (cn-engine)'
      : (providerDisplayNames.value[endpoint.providerId] ?? endpoint.providerId)

    if (!map.has(resolvedId)) {
      map.set(resolvedId, {
        identity: identity ?? { id: resolvedId, name: endpoint.displayName, providerMapping: {} },
        providerOptions: []
      })
    }

    map.get(resolvedId)!.providerOptions.push({
      label,
      endpointKey: endpoint.endpointKey,
      providerId: endpoint.providerId,
      providerModelId: endpoint.providerModelId,
      isLocal,
      isReady
    })
  }

  return map
})

const identityEntries = computed<IdentityEntry[]>(() =>
  Array.from(identityMap.value.entries())
    .map(([id, entry]) => ({ id, ...entry }))
    .sort((a, b) => a.identity.name.localeCompare(b.identity.name))
)

const currentEntry = computed(() => {
  for (const entry of identityMap.value.values()) {
    const match = entry.providerOptions.find((p) => p.endpointKey === generationStore.endpointKey)
    if (match) return { identity: entry.identity, provider: match, entry }
  }
  return null
})

const currentIdentityId = computed(() => currentEntry.value?.identity.id ?? null)
const currentProviderOptions = computed(() => currentEntry.value?.entry.providerOptions ?? [])
const showProviderSelect = computed(() => currentProviderOptions.value.length > 1)

// PrimeVue Select options
const modelOptions = computed(() =>
  identityEntries.value.map((e) => ({
    label: e.identity.name + (e.providerOptions.some((p) => p.isReady) ? '' : ' (Setup Required)'),
    value: e.id
  }))
)

const providerOptions = computed(() =>
  currentProviderOptions.value.map((o) => ({
    label: o.label + (o.isReady ? '' : ' (Setup Required)'),
    value: o.endpointKey
  }))
)

// ---------------------------------------------------------------------------
// Auto-select
// ---------------------------------------------------------------------------

watch(
  [currentEntry, identityEntries],
  ([entry, entries]) => {
    if (entry || entries.length === 0) return
    const firstReady = entries.find((e) => e.providerOptions.some((p) => p.isReady))
    const fallback = firstReady ?? entries[0]
    if (!fallback) return
    const local = fallback.providerOptions.find((p) => p.isLocal && p.isReady)
    const chosen = local ?? fallback.providerOptions[0]
    if (chosen) {
      generationStore.setEndpointKey(chosen.endpointKey)
      if (chosen.isLocal) void modelStore.setActiveModel(chosen.providerModelId)
    }
  }
)

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

function handleModelChange(identityId: string): void {
  const entry = identityMap.value.get(identityId)
  if (!entry) return
  const local = entry.providerOptions.find((p) => p.isLocal && p.isReady)
  const chosen = local ?? entry.providerOptions[0]
  if (chosen) {
    generationStore.setEndpointKey(chosen.endpointKey)
    if (chosen.isLocal) void modelStore.setActiveModel(chosen.providerModelId)
  }
}

function handleProviderChange(endpointKey: string): void {
  generationStore.setEndpointKey(endpointKey)
  const option = currentProviderOptions.value.find((p) => p.endpointKey === endpointKey)
  if (option?.isLocal) void modelStore.setActiveModel(option.providerModelId)
}
</script>

<template>
  <div class="space-y-2">
    <PaneSection title="Model">
      <Select
        :model-value="currentIdentityId"
        :options="modelOptions"
        option-label="label"
        option-value="value"
        placeholder="Select model"
        class="w-full"
        @update:model-value="handleModelChange"
      />
    </PaneSection>

    <PaneSection v-if="showProviderSelect" title="Provider">
      <Select
        :model-value="generationStore.endpointKey"
        :options="providerOptions"
        option-label="label"
        option-value="value"
        placeholder="Select provider"
        class="w-full"
        @update:model-value="handleProviderChange"
      />
    </PaneSection>
  </div>
</template>
