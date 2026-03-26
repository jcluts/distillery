import { defineStore } from 'pinia'
import { ref } from 'vue'

import type { EngineStatus } from '@/types'

const DEFAULT_STATUS: EngineStatus = {
  state: 'stopped'
}

export const useEngineStore = defineStore('engine', () => {
  const status = ref<EngineStatus>(DEFAULT_STATUS)

  function setStatus(nextStatus: EngineStatus): void {
    status.value = nextStatus
  }

  async function loadStatus(): Promise<void> {
    status.value = await window.api.getEngineStatus()
  }

  return {
    status,
    setStatus,
    loadStatus
  }
})
