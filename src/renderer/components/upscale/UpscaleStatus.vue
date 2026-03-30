<script setup lang="ts">
import { computed } from 'vue'
import Tag from 'primevue/tag'
import ProgressBar from 'primevue/progressbar'

import { useUpscaleStore } from '@/stores/upscale'

const store = useUpscaleStore()

const hasError = computed(() => store.progressPhase === 'error')
const hasContent = computed(
  () => store.isUpscaling || hasError.value || store.lastUpscaleTimeMs !== null
)

const statusLabel = computed(() => {
  if (store.isUpscaling) {
    if (store.progressPhase === 'preparing') return 'Preparing…'
    if (store.progressPhase === 'upscaling') return 'Upscaling…'
    if (store.progressPhase === 'saving') return 'Saving…'
    return 'Processing…'
  }
  if (hasError.value) {
    return store.progressMessage ? `Error: ${store.progressMessage}` : 'Upscale error'
  }
  if (store.lastUpscaleTimeMs !== null) {
    return `Completed in ${(store.lastUpscaleTimeMs / 1000).toFixed(1)}s`
  }
  return 'Idle'
})

const statusSeverity = computed(() => (hasError.value ? 'danger' : 'secondary'))

const progressValue = computed(() =>
  store.progressStep != null && store.progressTotalSteps != null && store.progressTotalSteps > 0
    ? Math.round((store.progressStep / store.progressTotalSteps) * 100)
    : 0
)
</script>

<template>
  <div v-if="hasContent" class="rounded-md border border-default p-3 space-y-2">
    <div class="flex items-center justify-between gap-2">
      <Tag :value="statusLabel" :severity="statusSeverity" class="max-w-[75%] truncate text-xs" />
      <span
        v-if="store.isUpscaling && store.progressPhase === 'upscaling' && store.progressStep != null && store.progressTotalSteps != null"
        class="text-xs tabular-nums text-muted"
      >
        {{ store.progressStep }} of {{ store.progressTotalSteps }} tiles
      </span>
    </div>

    <ProgressBar
      v-if="store.isUpscaling && store.progressPhase === 'preparing'"
      mode="indeterminate"
      class="h-1.5"
    />
    <ProgressBar
      v-else-if="store.isUpscaling && store.progressPhase === 'upscaling'"
      :value="progressValue"
      :show-value="false"
      class="h-1.5"
    />
    <ProgressBar
      v-else-if="store.isUpscaling && store.progressPhase === 'saving'"
      :value="100"
      mode="indeterminate"
      class="h-1.5"
    />
  </div>
</template>
