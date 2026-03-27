<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import PaneLayout from '@/components/panes/PaneLayout.vue'
import PaneSection from '@/components/panes/PaneSection.vue'
import { useImportFolderStore } from '@/stores/import-folder'
import { useUIStore } from '@/stores/ui'
import type { ImportFolderRecord, ImportScanProgress } from '@/types'

const importFolderStore = useImportFolderStore()
const uiStore = useUIStore()

const importedCount = ref(0)

onMounted(() => {
  void importFolderStore.loadFolders()
})

async function doImport(filePaths: string[]): Promise<void> {
  if (filePaths.length === 0) return
  const records = await window.api.importMedia(filePaths)
  importedCount.value += records?.length ?? 0
}

async function onChooseFiles(): Promise<void> {
  const paths = await window.api.showOpenDialog({
    title: 'Import media',
    properties: ['openFile', 'multiSelections'],
    filters: [
      {
        name: 'Media',
        extensions: ['png', 'jpg', 'jpeg', 'webp', 'bmp', 'tif', 'tiff', 'mp4', 'webm', 'mov']
      }
    ]
  })
  if (!paths) return
  await doImport(paths)
}

function onDrop(e: DragEvent): void {
  e.preventDefault()
  const files = Array.from(e.dataTransfer?.files ?? [])
  const filePaths = files
    .map((f) => (f as File & { path?: string }).path)
    .filter((p): p is string => typeof p === 'string' && p.length > 0)
  void doImport(filePaths)
}

function openImportFolderModal(editId?: string): void {
  importFolderStore.setEditingFolderId(editId ?? null)
  uiStore.openModal('import-folder')
}

function formatRelative(iso: string): string {
  const delta = Date.now() - new Date(iso).getTime()
  if (!Number.isFinite(delta) || delta < 0) return 'Just now'
  const sec = Math.floor(delta / 1000)
  if (sec < 60) return `${sec}s ago`
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  return `${Math.floor(hr / 24)}d ago`
}

function folderDetail(
  folder: ImportFolderRecord,
  progress: ImportScanProgress | undefined
): string {
  const isScanning = progress?.status === 'scanning' || progress?.status === 'importing'
  if (isScanning) {
    const total = Math.max(progress.files_found, progress.files_processed)
    return `Importing ${progress.files_processed}/${total}...`
  }
  if (progress?.status === 'error') return progress.error ?? 'Import failed'
  return folder.last_scanned ? `Last scanned ${formatRelative(folder.last_scanned)}` : 'Never scanned'
}

function isFolderScanning(progress: ImportScanProgress | undefined): boolean {
  return progress?.status === 'scanning' || progress?.status === 'importing'
}

const folders = computed(() => importFolderStore.folders)
const scanProgress = computed(() => importFolderStore.scanProgress)
</script>

<template>
  <PaneLayout title="Import">
    <div class="space-y-5">
      <!-- Quick Import -->
      <PaneSection title="Quick Import">
        <div
          class="cursor-pointer rounded-md border border-dashed p-6 text-center text-sm text-muted transition-colors hover:border-primary"
          role="button"
          tabindex="0"
          @dragover.prevent
          @drop="onDrop"
          @click="onChooseFiles"
          @keydown.enter="onChooseFiles"
          @keydown.space.prevent="onChooseFiles"
        >
          Drag files here, or click to browse
        </div>
        <UButton
          label="Choose files"
          color="neutral"
          variant="subtle"
          block
          @click="onChooseFiles"
        />
        <p v-if="importedCount > 0" class="text-xs text-muted">
          {{ importedCount }} imported
        </p>
      </PaneSection>

      <USeparator />

      <!-- Folder Import -->
      <PaneSection title="Folder Import">
        <UButton
          label="Import Folder..."
          color="neutral"
          variant="subtle"
          block
          @click="openImportFolderModal()"
        />
      </PaneSection>

      <USeparator />

      <!-- Saved Sources -->
      <PaneSection :title="`Saved Sources (${folders.length})`">
        <p v-if="folders.length === 0" class="text-xs text-muted">
          No saved sources yet.
        </p>
        <div v-else class="space-y-2">
          <div
            v-for="folder in folders"
            :key="folder.id"
            class="group rounded-md border p-2.5"
          >
            <div class="flex items-start justify-between gap-2">
              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-2">
                  <UIcon name="i-lucide-folder" class="size-3.5 shrink-0 text-muted" />
                  <span class="truncate text-sm font-medium">{{ folder.name }}</span>
                  <UBadge
                    v-if="folder.auto_import"
                    label="Auto"
                    color="neutral"
                    variant="subtle"
                    size="xs"
                  />
                </div>
                <p class="mt-1 truncate text-xs text-muted" :title="folder.path">
                  {{ folder.path }}
                </p>
                <p class="mt-1 text-xs text-muted">
                  {{ folderDetail(folder, scanProgress.get(folder.id)) }}
                </p>
              </div>

              <div class="flex items-center gap-0.5 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
                <UButton
                  icon="i-lucide-refresh-cw"
                  size="xs"
                  color="neutral"
                  variant="ghost"
                  :class="{ 'animate-spin': isFolderScanning(scanProgress.get(folder.id)) }"
                  :disabled="isFolderScanning(scanProgress.get(folder.id))"
                  @click="importFolderStore.scanFolder(folder.id)"
                />
                <UButton
                  icon="i-lucide-pencil"
                  size="xs"
                  color="neutral"
                  variant="ghost"
                  @click="openImportFolderModal(folder.id)"
                />
                <UButton
                  icon="i-lucide-trash-2"
                  size="xs"
                  color="error"
                  variant="ghost"
                  @click="importFolderStore.deleteFolder(folder.id)"
                />
              </div>
            </div>
          </div>
        </div>
      </PaneSection>
    </div>
  </PaneLayout>
</template>