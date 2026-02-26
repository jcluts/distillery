import { create } from 'zustand'
import { v4 as uuidv4 } from 'uuid'

import type {
  RemovalData,
  RemovalOperation,
  RemovalProgressEvent,
  RemovalResultEvent,
  RemovalStateSnapshot,
  RemovalStroke
} from '@/types'

function normalizeRemovalData(data: RemovalData | null): RemovalData {
  if (!data || data.version !== 1 || !Array.isArray(data.operations)) {
    return { version: 1, operations: [] }
  }

  return {
    version: 1,
    operations: data.operations.map((operation) => ({
      id: operation.id,
      strokes: operation.strokes,
      featherRadiusNormalized: operation.featherRadiusNormalized,
      enabled: operation.enabled !== false,
      timestamp: operation.timestamp,
      cache: operation.cache
    }))
  }
}

interface OverlayLayout {
  containerWidth: number
  containerHeight: number
  imageX: number
  imageY: number
  imageWidth: number
  imageHeight: number
}

interface RemovalState {
  dataByMediaId: Record<string, RemovalData>
  staleOperationIdsByMediaId: Record<string, string[]>
  loaded: Record<string, boolean>

  paintMode: boolean
  paintMediaId: string | null
  maskOverlay: OverlayLayout | null
  tool: 'paint' | 'erase'
  brushSizeNormalized: number
  featherRadiusNormalized: number

  draftStrokes: RemovalStroke[]
  strokeHistory: RemovalStroke[][]
  strokeHistoryIndex: number

  processingOperationIds: Set<string>
  refreshingOperationIds: Set<string>
  progressEvent: RemovalProgressEvent | null
  lastError: string | null

  loadData: (mediaId: string) => Promise<void>
  saveData: (mediaId: string, data: RemovalData | null) => Promise<void>

  enterPaintMode: (mediaId: string) => Promise<void>
  cancelPaintMode: () => void

  setTool: (tool: 'paint' | 'erase') => void
  setMaskOverlay: (overlay: OverlayLayout | null) => void
  setBrushSizeNormalized: (size: number) => void
  setFeatherRadiusNormalized: (radius: number) => void

  addStroke: (points: Array<{ x: number; y: number }>) => void
  undoStroke: () => void
  clearDraftStrokes: () => void

  applyDraft: () => Promise<void>
  toggleOperation: (mediaId: string, operationId: string, enabled: boolean) => Promise<void>
  deleteOperation: (mediaId: string, operationId: string) => Promise<void>
  refreshOperation: (mediaId: string, operationId: string) => Promise<void>
  refreshAllStale: (mediaId: string) => Promise<void>

  handleProgress: (event: RemovalProgressEvent) => void
  handleResult: (event: RemovalResultEvent) => Promise<void>
}

function withUpdatedHistory(
  state: RemovalState,
  nextStrokes: RemovalStroke[]
): Pick<RemovalState, 'draftStrokes' | 'strokeHistory' | 'strokeHistoryIndex'> {
  const truncated = state.strokeHistory.slice(0, state.strokeHistoryIndex + 1)
  truncated.push(nextStrokes)

  const history = truncated.slice(-64)
  return {
    draftStrokes: nextStrokes,
    strokeHistory: history,
    strokeHistoryIndex: history.length - 1
  }
}

export const useRemovalStore = create<RemovalState>((set, get) => ({
  dataByMediaId: {},
  staleOperationIdsByMediaId: {},
  loaded: {},

  paintMode: false,
  paintMediaId: null,
  maskOverlay: null,
  tool: 'paint',
  brushSizeNormalized: 0.035,
  featherRadiusNormalized: 0.01,

  draftStrokes: [],
  strokeHistory: [[]],
  strokeHistoryIndex: 0,

  processingOperationIds: new Set(),
  refreshingOperationIds: new Set(),
  progressEvent: null,
  lastError: null,

  loadData: async (mediaId) => {
    if (!mediaId) {
      return
    }

    try {
      const snapshot = (await window.api.removal.getData(mediaId)) as RemovalStateSnapshot
      const data = normalizeRemovalData(snapshot.data)
      set((state) => ({
        dataByMediaId: { ...state.dataByMediaId, [mediaId]: data },
        staleOperationIdsByMediaId: {
          ...state.staleOperationIdsByMediaId,
          [mediaId]: Array.isArray(snapshot.staleOperationIds) ? snapshot.staleOperationIds : []
        },
        loaded: { ...state.loaded, [mediaId]: true }
      }))
    } catch {
      set((state) => ({ loaded: { ...state.loaded, [mediaId]: true } }))
    }
  },

  saveData: async (mediaId, data) => {
    const normalized = normalizeRemovalData(data)

    set((state) => ({
      dataByMediaId: { ...state.dataByMediaId, [mediaId]: normalized },
      loaded: { ...state.loaded, [mediaId]: true }
    }))

    try {
      await window.api.removal.saveData(mediaId, normalized)
      await get().loadData(mediaId)
    } catch {
      // Keep optimistic local state; next refresh will reconcile.
    }
  },

  enterPaintMode: async (mediaId) => {
    if (!mediaId) {
      return
    }

    await get().loadData(mediaId)

    set({
      paintMode: true,
      paintMediaId: mediaId,
      maskOverlay: null,
      draftStrokes: [],
      strokeHistory: [[]],
      strokeHistoryIndex: 0,
      lastError: null
    })
  },

  cancelPaintMode: () => {
    set({
      paintMode: false,
      paintMediaId: null,
      maskOverlay: null,
      draftStrokes: [],
      strokeHistory: [[]],
      strokeHistoryIndex: 0
    })
  },

  setTool: (tool) => set({ tool }),

  setMaskOverlay: (overlay) => {
    set({ maskOverlay: overlay })
  },

  setBrushSizeNormalized: (size) => {
    const clamped = Math.max(0.004, Math.min(0.25, size))
    set({ brushSizeNormalized: clamped })
  },

  setFeatherRadiusNormalized: (radius) => {
    const clamped = Math.max(0, Math.min(0.2, radius))
    set({ featherRadiusNormalized: clamped })
  },

  addStroke: (points) => {
    if (points.length === 0) {
      return
    }

    const state = get()
    const stroke: RemovalStroke = {
      points,
      brushSizeNormalized: state.brushSizeNormalized,
      erasing: state.tool === 'erase'
    }

    const next = [...state.draftStrokes, stroke]
    set(withUpdatedHistory(state, next))
  },

  undoStroke: () => {
    const state = get()
    if (state.strokeHistoryIndex <= 0) {
      return
    }

    const nextIndex = state.strokeHistoryIndex - 1
    set({
      strokeHistoryIndex: nextIndex,
      draftStrokes: state.strokeHistory[nextIndex]
    })
  },

  clearDraftStrokes: () => {
    set({
      draftStrokes: [],
      strokeHistory: [[]],
      strokeHistoryIndex: 0
    })
  },

  applyDraft: async () => {
    const state = get()
    const mediaId = state.paintMediaId
    if (!mediaId || state.draftStrokes.length === 0) {
      return
    }

    await state.loadData(mediaId)

    const currentData = normalizeRemovalData(get().dataByMediaId[mediaId] ?? null)
    const operationId = uuidv4()

    const newOperation: RemovalOperation = {
      id: operationId,
      strokes: state.draftStrokes,
      featherRadiusNormalized: state.featherRadiusNormalized,
      enabled: true,
      timestamp: new Date().toISOString(),
      cache: null
    }

    const nextData: RemovalData = {
      version: 1,
      operations: [...currentData.operations, newOperation]
    }

    await state.saveData(mediaId, nextData)

    set((current) => {
      const processingOperationIds = new Set(current.processingOperationIds)
      processingOperationIds.add(operationId)
      return {
        processingOperationIds,
        draftStrokes: [],
        strokeHistory: [[]],
        strokeHistoryIndex: 0,
        paintMode: false,
        paintMediaId: null,
        maskOverlay: null,
        progressEvent: {
          mediaId,
          operationId,
          phase: 'preparing'
        },
        lastError: null
      }
    })

    try {
      await window.api.removal.process(mediaId, operationId)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to queue removal processing'
      set((current) => {
        const processingOperationIds = new Set(current.processingOperationIds)
        processingOperationIds.delete(operationId)
        return {
          processingOperationIds,
          lastError: message
        }
      })
    }
  },

  toggleOperation: async (mediaId, operationId, enabled) => {
    const state = get()
    await state.loadData(mediaId)

    const data = normalizeRemovalData(get().dataByMediaId[mediaId] ?? null)
    const nextData: RemovalData = {
      version: 1,
      operations: data.operations.map((operation) =>
        operation.id === operationId ? { ...operation, enabled } : operation
      )
    }

    await state.saveData(mediaId, nextData)
  },

  deleteOperation: async (mediaId, operationId) => {
    const state = get()
    await state.loadData(mediaId)

    const data = normalizeRemovalData(get().dataByMediaId[mediaId] ?? null)
    if (!data.operations.some((operation) => operation.id === operationId)) {
      return
    }

    await window.api.removal.deleteCaches(mediaId, [operationId])

    const nextData: RemovalData = {
      version: 1,
      operations: data.operations.filter((operation) => operation.id !== operationId)
    }

    await state.saveData(mediaId, nextData)

    set((current) => {
      const processingOperationIds = new Set(current.processingOperationIds)
      processingOperationIds.delete(operationId)

      const refreshingOperationIds = new Set(current.refreshingOperationIds)
      refreshingOperationIds.delete(operationId)

      return {
        processingOperationIds,
        refreshingOperationIds
      }
    })
  },

  refreshOperation: async (mediaId, operationId) => {
    set((state) => {
      const refreshingOperationIds = new Set(state.refreshingOperationIds)
      const processingOperationIds = new Set(state.processingOperationIds)
      refreshingOperationIds.add(operationId)
      processingOperationIds.add(operationId)
      return {
        refreshingOperationIds,
        processingOperationIds,
        progressEvent: {
          mediaId,
          operationId,
          phase: 'preparing'
        }
      }
    })

    try {
      await window.api.removal.process(mediaId, operationId)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to queue operation refresh'
      set((state) => {
        const refreshingOperationIds = new Set(state.refreshingOperationIds)
        const processingOperationIds = new Set(state.processingOperationIds)
        refreshingOperationIds.delete(operationId)
        processingOperationIds.delete(operationId)
        return {
          refreshingOperationIds,
          processingOperationIds,
          lastError: message
        }
      })
    }
  },

  refreshAllStale: async (mediaId) => {
    const state = get()
    await state.loadData(mediaId)

    try {
      await window.api.removal.processAllStale(mediaId)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to queue stale operation refresh'
      set({ lastError: message })
    }
  },

  handleProgress: (event) => {
    set((state) => {
      const processingOperationIds = new Set(state.processingOperationIds)
      const refreshingOperationIds = new Set(state.refreshingOperationIds)

      if (event.phase === 'complete' || event.phase === 'error') {
        processingOperationIds.delete(event.operationId)
        refreshingOperationIds.delete(event.operationId)
      } else {
        processingOperationIds.add(event.operationId)
      }

      return {
        processingOperationIds,
        refreshingOperationIds,
        progressEvent: event,
        lastError: event.phase === 'error' ? event.message ?? 'Removal processing failed' : state.lastError
      }
    })
  },

  handleResult: async (event) => {
    set((state) => {
      const processingOperationIds = new Set(state.processingOperationIds)
      const refreshingOperationIds = new Set(state.refreshingOperationIds)
      processingOperationIds.delete(event.operationId)
      refreshingOperationIds.delete(event.operationId)

      return {
        processingOperationIds,
        refreshingOperationIds,
        lastError: event.success ? null : event.error ?? 'Removal processing failed'
      }
    })

    await get().loadData(event.mediaId)
  }
}))
