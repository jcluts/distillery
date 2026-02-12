import { create } from 'zustand'
import type { EngineState, EngineStatus } from '../types'

// =============================================================================
// Engine Store
// Engine/model load status, subscribed to IPC events.
// =============================================================================

interface EngineStoreState {
  state: EngineState
  modelName: string | null
  error: string | null

  // Actions
  setStatus: (status: EngineStatus) => void
}

export const useEngineStore = create<EngineStoreState>((set) => ({
  state: 'stopped',
  modelName: null,
  error: null,

  setStatus: (status) =>
    set({
      state: status.state,
      modelName: status.modelName ?? null,
      error: status.error ?? null
    })
}))
