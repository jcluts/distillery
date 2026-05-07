import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import type { GenerationProgressEvent, WorkQueueItem } from '@/types'

export const useQueueStore = defineStore('queue', () => {
  const items = ref<WorkQueueItem[]>([])
  const activeJobId = ref<string | null>(null)
  const activePhase = ref<string | null>(null)
  const activeStep = ref<number | null>(null)
  const activeTotalSteps = ref<number | null>(null)
  const activeStartTime = ref<number | null>(null)

  const pendingCount = computed(() => items.value.filter((q) => q.status === 'pending').length)
  const isProcessing = computed(() => items.value.some((q) => q.status === 'processing'))

  function setItems(next: WorkQueueItem[]): void {
    items.value = next
  }

  function setActiveProgress(
    jobId: string,
    phase: string,
    step?: number,
    totalSteps?: number
  ): void {
    activeJobId.value = jobId
    activePhase.value = phase
    activeStep.value = step ?? null
    activeTotalSteps.value = totalSteps ?? null
  }

  function clearActiveProgress(): void {
    activeJobId.value = null
    activePhase.value = null
    activeStep.value = null
    activeTotalSteps.value = null
    activeStartTime.value = null
  }

  function startTimer(jobId: string): void {
    activeJobId.value = jobId
    activeStartTime.value = Date.now()
  }

  function handleProgressEvent(evt: GenerationProgressEvent): void {
    if (!evt?.generationId) return
    if (activeJobId.value !== evt.generationId) startTimer(evt.generationId)
    setActiveProgress(evt.generationId, evt.phase, evt.step, evt.totalSteps)
  }

  function syncFromQueueUpdate(next: WorkQueueItem[]): void {
    setItems(next)
    const processing = next.find((q) => q.status === 'processing')
    if (!processing) clearActiveProgress()
  }

  async function loadQueue(): Promise<void> {
    const queue = await window.api.getQueue()
    syncFromQueueUpdate(queue)
  }

  return {
    items,
    activeJobId,
    activePhase,
    activeStep,
    activeTotalSteps,
    activeStartTime,
    pendingCount,
    isProcessing,

    setItems,
    setActiveProgress,
    clearActiveProgress,
    startTimer,
    handleProgressEvent,
    syncFromQueueUpdate,
    loadQueue
  }
})
