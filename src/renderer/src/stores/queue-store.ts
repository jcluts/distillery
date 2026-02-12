import { create } from 'zustand'
import type { QueueItem } from '../types'

// =============================================================================
// Queue Store
// Active queue items + progress data.
// =============================================================================

interface QueueState {
  items: QueueItem[]
  activeJobId: string | null
  activePhase: string | null
  activeStep: number | null
  activeTotalSteps: number | null
  activeElapsedMs: number | null
  activeStartTime: number | null

  // Actions
  setItems: (items: QueueItem[]) => void
  setActiveProgress: (jobId: string, phase: string, step?: number, totalSteps?: number) => void
  clearActiveProgress: () => void
  startTimer: (jobId: string) => void
}

export const useQueueStore = create<QueueState>((set) => ({
  items: [],
  activeJobId: null,
  activePhase: null,
  activeStep: null,
  activeTotalSteps: null,
  activeElapsedMs: null,
  activeStartTime: null,

  setItems: (items) => set({ items }),

  setActiveProgress: (jobId, phase, step, totalSteps) =>
    set((state) => ({
      activeJobId: jobId,
      activePhase: phase,
      activeStep: step ?? state.activeStep,
      activeTotalSteps: totalSteps ?? state.activeTotalSteps,
      activeElapsedMs: state.activeStartTime
        ? Date.now() - state.activeStartTime
        : null
    })),

  clearActiveProgress: () =>
    set({
      activeJobId: null,
      activePhase: null,
      activeStep: null,
      activeTotalSteps: null,
      activeElapsedMs: null,
      activeStartTime: null
    }),

  startTimer: (jobId) =>
    set({
      activeJobId: jobId,
      activeStartTime: Date.now()
    })
}))
