<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { Icon } from '@iconify/vue'
import Button from 'primevue/button'

import { useGenerationStore } from '@/stores/generation'
import { useModelStore } from '@/stores/model'
import { useProviderStore } from '@/stores/provider'
import { useModelBrowsingStore } from '@/stores/model-browsing'
import type { CanonicalEndpointDef, GenerationMode } from '@/types'

const MODES: { value: GenerationMode; label: string; icon: string; outputType: 'image' | 'video' }[] = [
  { value: 'text-to-image', label: 'Text to Image', icon: 'lucide:image', outputType: 'image' },
  { value: 'image-to-image', label: 'Image to Image', icon: 'lucide:image-plus', outputType: 'image' },
  { value: 'text-to-video', label: 'Text to Video', icon: 'lucide:video', outputType: 'video' },
  { value: 'image-to-video', label: 'Image to Video', icon: 'lucide:film', outputType: 'video' }
]

const generationStore = useGenerationStore()
const modelStore = useModelStore()
const providerStore = useProviderStore()
const modelBrowsingStore = useModelBrowsingStore()
const endpoints = ref<CanonicalEndpointDef[]>([])

async function refreshEndpoints(): Promise<void> {
  try {
    endpoints.value = await window.api.listGenerationEndpoints()
  } catch {
    // ignore
  }
}

onMounted(async () => {
  await Promise.all([
    providerStore.loadProviders(),
    modelBrowsingStore.loadAllUserModels(),
    refreshEndpoints()
  ])
})

watch(
  () => modelBrowsingStore.catalogVersion,
  () => {
    void refreshEndpoints()
  }
)

const selectedEndpoint = computed(() =>
  endpoints.value.find((ep) => ep.endpointKey === generationStore.endpointKey) ?? null
)

const availableModes = computed(() => {
  return MODES.filter((mode) =>
    endpoints.value.some((endpoint) => endpoint.modes.includes(mode.value))
  )
})

// Ensure current mode is valid when available modes change
watch(availableModes, (modes) => {
  if (modes.some((m) => m.value === generationStore.generationMode)) return
  if (modes[0]) {
    generationStore.setGenerationMode(modes[0].value)
    selectCompatibleEndpoint(modes[0].value)
  }
})

function handleModeChange(value: GenerationMode): void {
  if (!value) return
  generationStore.setGenerationMode(value)
  if (!selectedEndpoint.value?.modes.includes(value)) {
    selectCompatibleEndpoint(value)
  }
}

function isEndpointReady(endpoint: CanonicalEndpointDef): boolean {
  if (endpoint.providerId !== 'local') return true
  return modelStore.filesByModelId[endpoint.providerModelId]?.isReady ?? false
}

function selectCompatibleEndpoint(mode: GenerationMode): void {
  const compatible = endpoints.value.filter((endpoint) => endpoint.modes.includes(mode))
  if (compatible.length === 0) return

  const localReady = compatible.find(
    (endpoint) => endpoint.providerId === 'local' && isEndpointReady(endpoint)
  )
  const remote = compatible.find((endpoint) => endpoint.providerId !== 'local')
  const ready = compatible.find(isEndpointReady)
  const chosen = mode.includes('video')
    ? (remote ?? ready ?? compatible[0])
    : (localReady ?? ready ?? compatible[0])

  generationStore.setEndpointKey(chosen.endpointKey)
  if (chosen.providerId === 'local') void modelStore.setActiveModel(chosen.providerModelId)
}
</script>

<template>
  <div class="flex gap-1">
    <Button
      v-for="mode in availableModes"
      :key="mode.value"
      size="small"
      :outlined="generationStore.generationMode !== mode.value"
      :severity="generationStore.generationMode === mode.value ? undefined : 'secondary'"
      class="flex-1 gap-1"
      :aria-label="mode.label"
      @click="handleModeChange(mode.value)"
    >
      <Icon :icon="mode.icon" class="size-3.5" />
      <span class="text-xs">{{ mode.label }}</span>
    </Button>
  </div>
</template>
