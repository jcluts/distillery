<script setup lang="ts">
import { computed, ref } from 'vue'
import Button from 'primevue/button'
import ProgressBar from 'primevue/progressbar'
import Tag from 'primevue/tag'

import { useEngineStore } from '@/stores/engine'
import { useModelStore } from '@/stores/model'
import { useQueueStore } from '@/stores/queue'

// ---------------------------------------------------------------------------
// Store state
// ---------------------------------------------------------------------------

const engineStore = useEngineStore()
const modelStore = useModelStore()
const queueStore = useQueueStore()

const isUnloadingModel = ref(false)

// ---------------------------------------------------------------------------
// Derived state
// ---------------------------------------------------------------------------

const usesCnEngine = computed(() => modelStore.settings?.local_generation_backend === 'cn-engine')
const isModelLoading = computed(() => usesCnEngine.value && engineStore.status.state === 'loading')
const isModelReady = computed(() => usesCnEngine.value && engineStore.status.state === 'ready')
const hasError = computed(() => usesCnEngine.value && engineStore.status.state === 'error')

const isGenerating = computed(() => !!queueStore.activePhase && !isModelLoading.value)
const isQueueProcessing = computed(() => queueStore.items.some((q) => q.status === 'processing'))
const hasDeterminateProgress = computed(
  () =>
    queueStore.activeStep != null &&
    queueStore.activeTotalSteps != null &&
    queueStore.activeTotalSteps > 0
)

const canUnloadModel = computed(
  () =>
    isModelReady.value &&
    !isQueueProcessing.value &&
    !isUnloadingModel.value &&
    queueStore.pendingCount === 0
)

const progressValue = computed(() => {
  const { activeStep, activeTotalSteps } = queueStore
  if (hasDeterminateProgress.value && activeStep != null && activeTotalSteps != null) {
    return Math.round((activeStep / activeTotalSteps) * 100)
  }
  return 0
})

// Show when there's something worth reporting
const hasContent = computed(
  () =>
    isModelLoading.value ||
    isGenerating.value ||
    queueStore.pendingCount > 0 ||
    hasError.value ||
    isModelReady.value
)

// Status label + severity
const statusLabel = computed(() => {
  if (isModelLoading.value) return 'Loading model…'
  if (isGenerating.value)
    return queueStore.activePhase ? `Generating: ${queueStore.activePhase}` : 'Generating…'
  if (hasError.value)
    return engineStore.status.error ? `Engine error: ${engineStore.status.error}` : 'Engine error'
  if (isModelReady.value) return 'Model ready'
  return 'Idle'
})

const statusSeverity = computed<'secondary' | 'danger'>(() =>
  hasError.value ? 'danger' : 'secondary'
)

// ---------------------------------------------------------------------------
// Unload
// ---------------------------------------------------------------------------

async function handleUnloadModel(): Promise<void> {
  isUnloadingModel.value = true
  try {
    await window.api.unloadModel()
  } catch {
    // engine status event drives error state
  } finally {
    isUnloadingModel.value = false
  }
}
</script>

<template>
  <div v-if="hasContent" class="rounded-lg border border-default bg-elevated p-3 space-y-2">
    <!-- Status header -->
    <div class="flex items-center justify-between gap-2">
      <Tag :severity="statusSeverity" class="max-w-[75%] truncate text-xs">
        {{ statusLabel }}
      </Tag>

      <div class="flex items-center gap-2">
        <!-- Step counter -->
        <span v-if="isGenerating && hasDeterminateProgress" class="text-xs tabular-nums text-muted">
          {{ queueStore.activeStep }}/{{ queueStore.activeTotalSteps }}
        </span>

        <!-- Unload model -->
        <Button
          v-if="isModelReady && !isGenerating"
          type="button"
          size="small"
          severity="secondary"
          outlined
          :disabled="!canUnloadModel"
          :label="isUnloadingModel ? 'Unloading…' : 'Unload model'"
          @click="handleUnloadModel"
        />
      </div>
    </div>

    <!-- Progress bar -->
    <ProgressBar v-if="isModelLoading" mode="indeterminate" class="!h-1.5" />
    <ProgressBar
      v-else-if="isGenerating && hasDeterminateProgress"
      :value="progressValue"
      :show-value="false"
      class="!h-1.5"
    />
    <ProgressBar v-else-if="isGenerating" mode="indeterminate" class="!h-1.5" />

    <!-- Pending counter -->
    <p v-if="queueStore.pendingCount > 0" class="text-xs text-muted">
      {{ queueStore.pendingCount }}
      {{ queueStore.pendingCount === 1 ? 'generation' : 'generations' }} pending
    </p>
  </div>
</template>
