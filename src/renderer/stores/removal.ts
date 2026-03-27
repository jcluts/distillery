import { defineStore } from 'pinia'
import { ref } from 'vue'

import { useLibraryStore } from '@/stores/library'
import type {
  RemovalData,
  RemovalOperation,
  RemovalProgressEvent,
  RemovalResultEvent,
  RemovalStateSnapshot,
  RemovalStroke
} from '@/types'

export interface OverlayLayout {
  containerWidth: number
  containerHeight: number
  imageX: number
  imageY: number
  imageWidth: number
  imageHeight: number
}

function normalizeRemovalData(data: RemovalData | null): RemovalData {
  if (!data || data.version !== 1 || !Array.isArray(data.operations)) {
    return { version: 1, operations: [] }
  }

  return {
    version: 1,
    operations: data.operations.map((op) => ({
      id: op.id,
      strokes: op.strokes.map((s) => ({
        points: s.points.map((p) => ({ x: p.x, y: p.y })),
        brushSizeNormalized: s.brushSizeNormalized,
        erasing: s.erasing
      })),
      featherRadiusNormalized: op.featherRadiusNormalized,
      enabled: op.enabled !== false,
      timestamp: op.timestamp,
      cache: op.cache
        ? {
            sourceHash: op.cache.sourceHash,
            resultPath: op.cache.resultPath,
            width: op.cache.width,
            height: op.cache.height,
            timestamp: op.cache.timestamp
          }
        : null
    }))
  }
}

export const useRemovalStore = defineStore('removal', () => {
  // Per-media data cache
  const dataByMediaId = ref<Record<string, RemovalData>>({})
  const staleOperationIdsByMediaId = ref<Record<string, string[]>>({})
  const loaded = ref<Record<string, boolean>>({})

  // Paint mode state
  const paintMode = ref(false)
  const paintMediaId = ref<string | null>(null)
  const maskOverlay = ref<OverlayLayout | null>(null)
  const tool = ref<'paint' | 'erase'>('paint')
  const brushSizeNormalized = ref(0.035)
  const featherRadiusNormalized = ref(0.01)

  // Draft stroke state
  const draftStrokes = ref<RemovalStroke[]>([])
  const strokeHistory = ref<RemovalStroke[][]>([[]])
  const strokeHistoryIndex = ref(0)

  // Processing state
  const processingOperationIds = ref(new Set<string>())
  const refreshingOperationIds = ref(new Set<string>())
  const progressEvent = ref<RemovalProgressEvent | null>(null)
  const lastError = ref<string | null>(null)

  // -----------------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------------

  function pushHistory(nextStrokes: RemovalStroke[]): void {
    const truncated = strokeHistory.value.slice(0, strokeHistoryIndex.value + 1)
    truncated.push(nextStrokes)
    const history = truncated.slice(-64)
    strokeHistory.value = history
    strokeHistoryIndex.value = history.length - 1
    draftStrokes.value = nextStrokes
  }

  // -----------------------------------------------------------------------
  // Data loading / saving
  // -----------------------------------------------------------------------

  async function loadData(mediaId: string): Promise<void> {
    if (!mediaId) return

    try {
      const snapshot = (await window.api.removal.getData(mediaId)) as RemovalStateSnapshot
      const data = normalizeRemovalData(snapshot.data)
      dataByMediaId.value = { ...dataByMediaId.value, [mediaId]: data }
      staleOperationIdsByMediaId.value = {
        ...staleOperationIdsByMediaId.value,
        [mediaId]: Array.isArray(snapshot.staleOperationIds) ? snapshot.staleOperationIds : []
      }
      loaded.value = { ...loaded.value, [mediaId]: true }
    } catch {
      loaded.value = { ...loaded.value, [mediaId]: true }
    }
  }

  async function saveData(mediaId: string, data: RemovalData | null): Promise<void> {
    const normalized = normalizeRemovalData(data)

    dataByMediaId.value = { ...dataByMediaId.value, [mediaId]: normalized }
    loaded.value = { ...loaded.value, [mediaId]: true }

    // The IPC save must succeed — callers (e.g. applyDraft) depend on it.
    await window.api.removal.saveData(mediaId, normalized)

    // Non-critical follow-ups: reload state from DB and refresh library item.
    try {
      await loadData(mediaId)
      const updated = await window.api.getMediaById(mediaId)
      if (updated) {
        useLibraryStore().updateLocalItem(mediaId, {
          working_file_path: updated.working_file_path ?? null
        })
      }
    } catch {
      // Keep optimistic local state; next refresh will reconcile.
    }
  }

  // -----------------------------------------------------------------------
  // Paint mode
  // -----------------------------------------------------------------------

  async function enterPaintMode(mediaId: string): Promise<void> {
    if (!mediaId) return

    await loadData(mediaId)

    paintMode.value = true
    paintMediaId.value = mediaId
    maskOverlay.value = null
    draftStrokes.value = []
    strokeHistory.value = [[]]
    strokeHistoryIndex.value = 0
    lastError.value = null
  }

  function cancelPaintMode(): void {
    paintMode.value = false
    paintMediaId.value = null
    maskOverlay.value = null
    draftStrokes.value = []
    strokeHistory.value = [[]]
    strokeHistoryIndex.value = 0
  }

  function setTool(t: 'paint' | 'erase'): void {
    tool.value = t
  }

  function setMaskOverlay(overlay: OverlayLayout | null): void {
    maskOverlay.value = overlay
  }

  function setBrushSizeNormalized(size: number): void {
    brushSizeNormalized.value = Math.max(0.004, Math.min(0.25, size))
  }

  function setFeatherRadiusNormalized(radius: number): void {
    featherRadiusNormalized.value = Math.max(0, Math.min(0.2, radius))
  }

  // -----------------------------------------------------------------------
  // Stroke editing
  // -----------------------------------------------------------------------

  function addStroke(points: Array<{ x: number; y: number }>): void {
    if (points.length === 0) return

    const stroke: RemovalStroke = {
      points,
      brushSizeNormalized: brushSizeNormalized.value,
      erasing: tool.value === 'erase'
    }

    pushHistory([...draftStrokes.value, stroke])
  }

  function undoStroke(): void {
    if (strokeHistoryIndex.value <= 0) return

    const nextIndex = strokeHistoryIndex.value - 1
    strokeHistoryIndex.value = nextIndex
    draftStrokes.value = strokeHistory.value[nextIndex]
  }

  function clearDraftStrokes(): void {
    draftStrokes.value = []
    strokeHistory.value = [[]]
    strokeHistoryIndex.value = 0
  }

  // -----------------------------------------------------------------------
  // Operations
  // -----------------------------------------------------------------------

  async function applyDraft(): Promise<void> {
    const mediaId = paintMediaId.value
    if (!mediaId || draftStrokes.value.length === 0) return

    await loadData(mediaId)

    const currentData = normalizeRemovalData(dataByMediaId.value[mediaId] ?? null)
    const operationId = crypto.randomUUID()

    const newOperation: RemovalOperation = {
      id: operationId,
      strokes: draftStrokes.value,
      featherRadiusNormalized: featherRadiusNormalized.value,
      enabled: true,
      timestamp: new Date().toISOString(),
      cache: null
    }

    const nextData: RemovalData = {
      version: 1,
      operations: [...currentData.operations, newOperation]
    }

    try {
      await saveData(mediaId, nextData)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to save removal data'
      lastError.value = message
      return
    }

    const nextProcessing = new Set(processingOperationIds.value)
    nextProcessing.add(operationId)
    processingOperationIds.value = nextProcessing
    draftStrokes.value = []
    strokeHistory.value = [[]]
    strokeHistoryIndex.value = 0
    paintMode.value = false
    paintMediaId.value = null
    maskOverlay.value = null
    progressEvent.value = { mediaId, operationId, phase: 'preparing' }
    lastError.value = null

    try {
      await window.api.removal.process(mediaId, operationId)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to queue removal processing'
      const rollback = new Set(processingOperationIds.value)
      rollback.delete(operationId)
      processingOperationIds.value = rollback
      lastError.value = message
    }
  }

  async function toggleOperation(mediaId: string, operationId: string, enabled: boolean): Promise<void> {
    await loadData(mediaId)

    const data = normalizeRemovalData(dataByMediaId.value[mediaId] ?? null)
    const nextData: RemovalData = {
      version: 1,
      operations: data.operations.map((op) =>
        op.id === operationId ? { ...op, enabled } : op
      )
    }

    await saveData(mediaId, nextData)
  }

  async function deleteOperation(mediaId: string, operationId: string): Promise<void> {
    await loadData(mediaId)

    const data = normalizeRemovalData(dataByMediaId.value[mediaId] ?? null)
    if (!data.operations.some((op) => op.id === operationId)) return

    await window.api.removal.deleteCaches(mediaId, [operationId])

    const nextData: RemovalData = {
      version: 1,
      operations: data.operations.filter((op) => op.id !== operationId)
    }

    await saveData(mediaId, nextData)

    const nextProcessing = new Set(processingOperationIds.value)
    nextProcessing.delete(operationId)
    processingOperationIds.value = nextProcessing

    const nextRefreshing = new Set(refreshingOperationIds.value)
    nextRefreshing.delete(operationId)
    refreshingOperationIds.value = nextRefreshing
  }

  async function refreshOperation(mediaId: string, operationId: string): Promise<void> {
    const nextRefreshing = new Set(refreshingOperationIds.value)
    const nextProcessing = new Set(processingOperationIds.value)
    nextRefreshing.add(operationId)
    nextProcessing.add(operationId)
    refreshingOperationIds.value = nextRefreshing
    processingOperationIds.value = nextProcessing
    progressEvent.value = { mediaId, operationId, phase: 'preparing' }

    try {
      await window.api.removal.process(mediaId, operationId)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to queue operation refresh'
      const rollbackRefreshing = new Set(refreshingOperationIds.value)
      const rollbackProcessing = new Set(processingOperationIds.value)
      rollbackRefreshing.delete(operationId)
      rollbackProcessing.delete(operationId)
      refreshingOperationIds.value = rollbackRefreshing
      processingOperationIds.value = rollbackProcessing
      lastError.value = message
    }
  }

  async function refreshAllStale(mediaId: string): Promise<void> {
    await loadData(mediaId)

    try {
      await window.api.removal.processAllStale(mediaId)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to queue stale operation refresh'
      lastError.value = message
    }
  }

  // -----------------------------------------------------------------------
  // IPC event handlers
  // -----------------------------------------------------------------------

  function handleProgress(event: RemovalProgressEvent): void {
    const nextProcessing = new Set(processingOperationIds.value)
    const nextRefreshing = new Set(refreshingOperationIds.value)

    if (event.phase === 'complete' || event.phase === 'error') {
      nextProcessing.delete(event.operationId)
      nextRefreshing.delete(event.operationId)
    } else {
      nextProcessing.add(event.operationId)
    }

    processingOperationIds.value = nextProcessing
    refreshingOperationIds.value = nextRefreshing
    progressEvent.value = event
    if (event.phase === 'error') {
      lastError.value = event.message ?? 'Removal processing failed'
    }
  }

  async function handleResult(event: RemovalResultEvent): Promise<void> {
    const nextProcessing = new Set(processingOperationIds.value)
    const nextRefreshing = new Set(refreshingOperationIds.value)
    nextProcessing.delete(event.operationId)
    nextRefreshing.delete(event.operationId)
    processingOperationIds.value = nextProcessing
    refreshingOperationIds.value = nextRefreshing
    lastError.value = event.success ? null : (event.error ?? 'Removal processing failed')

    await loadData(event.mediaId)

    if (event.success) {
      try {
        const updated = await window.api.getMediaById(event.mediaId)
        if (updated) {
          useLibraryStore().updateLocalItem(event.mediaId, {
            working_file_path: updated.working_file_path ?? null
          })
        }
      } catch {
        // loadMedia will catch up
      }
    }
  }

  return {
    dataByMediaId,
    staleOperationIdsByMediaId,
    loaded,
    paintMode,
    paintMediaId,
    maskOverlay,
    tool,
    brushSizeNormalized,
    featherRadiusNormalized,
    draftStrokes,
    strokeHistory,
    strokeHistoryIndex,
    processingOperationIds,
    refreshingOperationIds,
    progressEvent,
    lastError,
    loadData,
    saveData,
    enterPaintMode,
    cancelPaintMode,
    setTool,
    setMaskOverlay,
    setBrushSizeNormalized,
    setFeatherRadiusNormalized,
    addStroke,
    undoStroke,
    clearDraftStrokes,
    applyDraft,
    toggleOperation,
    deleteOperation,
    refreshOperation,
    refreshAllStale,
    handleProgress,
    handleResult
  }
})
