import { defineStore } from 'pinia'
import { ref } from 'vue'

import type {
  ImportFolderCreate,
  ImportFolderRecord,
  ImportFolderUpdate,
  ImportScanProgress
} from '@/types'

export const useImportFolderStore = defineStore('import-folder', () => {
  const folders = ref<ImportFolderRecord[]>([])
  const scanProgress = ref(new Map<string, ImportScanProgress>())
  const isLoading = ref(false)
  const editingFolderId = ref<string | null>(null)

  async function loadFolders(): Promise<void> {
    isLoading.value = true
    try {
      folders.value = await window.api.importFolders.getAll()
    } finally {
      isLoading.value = false
    }
  }

  async function startImport(data: ImportFolderCreate): Promise<ImportScanProgress> {
    const result = await window.api.importFolders.start(data)
    setScanProgress(result)
    if (data.persist) {
      await loadFolders()
    }
    return result
  }

  async function updateFolder(data: ImportFolderUpdate): Promise<void> {
    await window.api.importFolders.update(data)
    await loadFolders()
  }

  async function deleteFolder(id: string): Promise<void> {
    await window.api.importFolders.delete(id)
    clearScanProgress(id)
    await loadFolders()
  }

  async function scanFolder(id: string): Promise<void> {
    const result = await window.api.importFolders.scan(id)
    setScanProgress(result)
    await loadFolders()
  }

  function setScanProgress(progress: ImportScanProgress): void {
    const next = new Map(scanProgress.value)
    next.set(progress.folder_id, progress)
    scanProgress.value = next
  }

  function clearScanProgress(folderId: string): void {
    const next = new Map(scanProgress.value)
    next.delete(folderId)
    scanProgress.value = next
  }

  function setEditingFolderId(id: string | null): void {
    editingFolderId.value = id
  }

  return {
    folders,
    scanProgress,
    isLoading,
    editingFolderId,
    loadFolders,
    startImport,
    updateFolder,
    deleteFolder,
    scanFolder,
    setScanProgress,
    clearScanProgress,
    setEditingFolderId
  }
})
