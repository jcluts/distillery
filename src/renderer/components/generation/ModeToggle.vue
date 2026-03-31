<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { Icon } from '@iconify/vue'
import Button from 'primevue/button'

import { useGenerationStore } from '@/stores/generation'
import type { CanonicalEndpointDef, GenerationMode } from '@/types'

const MODES: { value: GenerationMode; label: string; icon: string; outputType: 'image' | 'video' }[] = [
  { value: 'text-to-image', label: 'Text to Image', icon: 'lucide:image', outputType: 'image' },
  { value: 'image-to-image', label: 'Image to Image', icon: 'lucide:image-plus', outputType: 'image' },
  { value: 'text-to-video', label: 'Text to Video', icon: 'lucide:video', outputType: 'video' },
  { value: 'image-to-video', label: 'Image to Video', icon: 'lucide:film', outputType: 'video' }
]

const generationStore = useGenerationStore()
const endpoints = ref<CanonicalEndpointDef[]>([])

onMounted(async () => {
  try {
    endpoints.value = await window.api.listGenerationEndpoints()
  } catch {
    // ignore
  }
})

const selectedEndpoint = computed(() =>
  endpoints.value.find((ep) => ep.endpointKey === generationStore.endpointKey) ?? null
)

const availableModes = computed(() => {
  if (!selectedEndpoint.value) return MODES
  return MODES.filter((m) => m.outputType === selectedEndpoint.value!.outputType)
})

// Ensure current mode is valid when available modes change
watch(availableModes, (modes) => {
  if (modes.some((m) => m.value === generationStore.generationMode)) return
  if (modes[0]) generationStore.setGenerationMode(modes[0].value)
})

function handleModeChange(value: GenerationMode): void {
  if (value) generationStore.setGenerationMode(value)
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
