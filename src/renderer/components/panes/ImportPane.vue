<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { Icon } from '@iconify/vue'
import Button from 'primevue/button'
import Tag from 'primevue/tag'
import Divider from 'primevue/divider'

import PaneBody from '@/components/panes/primitives/PaneBody.vue'
import PaneLayout from '@/components/panes/primitives/PaneLayout.vue'
import PaneSection from '@/components/panes/primitives/PaneSection.vue'
import ListItem from '@/components/shared/ListItem.vue'
import { useImportFolderStore } from '@/stores/import-folder'
import { useUIStore } from '@/stores/ui'
import { formatRelative } from '@/lib/format'
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
  return folder.last_scanned
    ? `Last scanned ${formatRelative(folder.last_scanned)}`
    : 'Never scanned'
}

function isFolderScanning(progress: ImportScanProgress | undefined): boolean {
  return progress?.status === 'scanning' || progress?.status === 'importing'
}

const folders = computed(() => importFolderStore.folders)
const scanProgress = computed(() => importFolderStore.scanProgress)
</script>

<template>
  <PaneLayout title="Import">
    <PaneBody>
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
        <Button
          label="Choose files"
          severity="secondary"
          outlined
          class="w-full"
          @click="onChooseFiles"
        />
        <p v-if="importedCount > 0" class="text-xs text-muted">{{ importedCount }} imported</p>
      </PaneSection>

      <Divider />

      <!-- Folder Import -->
      <PaneSection title="Folder Import">
        <Button
          label="Import Folder..."
          severity="secondary"
          outlined
          class="w-full"
          @click="openImportFolderModal()"
        />
      </PaneSection>

      <Divider />

      <!-- Saved Sources -->
      <PaneSection :title="`Saved Sources (${folders.length})`">
        <p v-if="folders.length === 0" class="text-xs text-muted">No saved sources yet.</p>
        <div v-else class="space-y-1.5">
          <ListItem v-for="folder in folders" :key="folder.id">
            <template #icon>
              <Icon icon="lucide:folder" class="size-4 text-muted" />
            </template>
            <div class="flex items-center gap-2">
              <span class="truncate font-medium">{{ folder.name }}</span>
              <Tag v-if="folder.auto_import" value="Auto" severity="secondary" />
            </div>
            <p class="mt-0.5 truncate text-xs text-muted" :title="folder.path">
              {{ folder.path }}
            </p>
            <p class="mt-0.5 text-xs text-muted">
              {{ folderDetail(folder, scanProgress.get(folder.id)) }}
            </p>
            <template #actions>
              <Button
                text
                plain
                severity="secondary"
                size="small"
                :class="{ 'animate-spin': isFolderScanning(scanProgress.get(folder.id)) }"
                :disabled="isFolderScanning(scanProgress.get(folder.id))"
                @click.stop="importFolderStore.scanFolder(folder.id)"
              >
                <Icon icon="lucide:refresh-cw" class="size-4" />
              </Button>
              <Button
                text
                plain
                severity="secondary"
                size="small"
                @click.stop="openImportFolderModal(folder.id)"
              >
                <Icon icon="lucide:pencil" class="size-4" />
              </Button>
              <Button
                text
                plain
                severity="danger"
                size="small"
                @click.stop="importFolderStore.deleteFolder(folder.id)"
              >
                <Icon icon="lucide:trash-2" class="size-4" />
              </Button>
            </template>
          </ListItem>
        </div>
      </PaneSection>
    </PaneBody>
  </PaneLayout>
</template>
