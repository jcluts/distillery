import { create } from 'zustand'

import type {
  ImportFolderCreate,
  ImportFolderRecord,
  ImportFolderUpdate,
  ImportScanProgress
} from '@/types'

interface ImportFolderState {
  folders: ImportFolderRecord[]
  scanProgress: Map<string, ImportScanProgress>
  isLoading: boolean
  editingFolderId: string | null

  loadFolders: () => Promise<void>
  startImport: (data: ImportFolderCreate) => Promise<ImportScanProgress>
  updateFolder: (data: ImportFolderUpdate) => Promise<void>
  deleteFolder: (id: string) => Promise<void>
  scanFolder: (id: string) => Promise<void>
  setScanProgress: (progress: ImportScanProgress) => void
  clearScanProgress: (folderId: string) => void
  setEditingFolderId: (id: string | null) => void
}

export const useImportFolderStore = create<ImportFolderState>((set, get) => ({
  folders: [],
  scanProgress: new Map(),
  isLoading: false,
  editingFolderId: null,

  loadFolders: async () => {
    set({ isLoading: true })
    try {
      const folders = await window.api.importFolders.getAll()
      set({ folders })
    } finally {
      set({ isLoading: false })
    }
  },

  startImport: async (data) => {
    const result = await window.api.importFolders.start(data)
    get().setScanProgress(result)
    if (data.persist) {
      await get().loadFolders()
    }
    return result
  },

  updateFolder: async (data) => {
    await window.api.importFolders.update(data)
    await get().loadFolders()
  },

  deleteFolder: async (id) => {
    await window.api.importFolders.delete(id)
    get().clearScanProgress(id)
    await get().loadFolders()
  },

  scanFolder: async (id) => {
    const result = await window.api.importFolders.scan(id)
    get().setScanProgress(result)
    await get().loadFolders()
  },

  setScanProgress: (progress) =>
    set((state) => {
      const next = new Map(state.scanProgress)
      next.set(progress.folder_id, progress)
      return { scanProgress: next }
    }),

  clearScanProgress: (folderId) =>
    set((state) => {
      const next = new Map(state.scanProgress)
      next.delete(folderId)
      return { scanProgress: next }
    }),

  setEditingFolderId: (id) => {
    set({ editingFolderId: id })
  }
}))
