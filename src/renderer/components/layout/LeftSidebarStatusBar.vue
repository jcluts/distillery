<script setup lang="ts">
import { computed } from 'vue'

import { useEngineStore } from '@/stores/engine'

const engineStore = useEngineStore()

const toneClass = computed(() => {
  switch (engineStore.status.state) {
    case 'ready':
    case 'idle':
      return 'bg-success'
    case 'starting':
    case 'loading':
      return 'bg-warning'
    case 'error':
      return 'bg-error'
    default:
      return 'bg-muted-foreground/50'
  }
})

const statusLabel = computed(() => {
  switch (engineStore.status.state) {
    case 'ready':
      return 'Ready'
    case 'idle':
      return 'Idle'
    case 'starting':
      return 'Starting'
    case 'loading':
      return 'Loading model'
    case 'error':
      return engineStore.status.error || 'Engine error'
    default:
      return 'Stopped'
  }
})
</script>

<template>
  <div class="border-t px-4 py-3 text-xs">
    <div class="flex items-center gap-2">
      <span class="size-2 rounded-full" :class="toneClass" />
      <span class="font-medium">{{ statusLabel }}</span>
    </div>
    <p v-if="engineStore.status.modelName" class="mt-1 truncate text-muted-foreground">
      {{ engineStore.status.modelName }}
    </p>
  </div>
</template>
