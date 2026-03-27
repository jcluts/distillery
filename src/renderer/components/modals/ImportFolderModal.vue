<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import { useCollectionStore } from '@/stores/collection'
import { useImportFolderStore } from '@/stores/import-folder'
import { useUIStore } from '@/stores/ui'
import type { ImportFolderMode } from '@/types'

const NONE_COLLECTION_VALUE = '__none__'

const IMPORT_MODE_ITEMS = [
  { label: 'Reference files in place', value: 'reference' as ImportFolderMode },
  { label: 'Copy files to library', value: 'copy' as ImportFolderMode },
  { label: 'Move files to library', value: 'move' as ImportFolderMode }
]

function basenameFromPath(folderPath: string): string {
  const cleaned = folderPath.replace(/[\\/]+$/, '')
  const segments = cleaned.split(/[\\/]/)
  return segments[segments.length - 1] || cleaned
}

function parseKeywords(raw: string): string[] {
  return [
    ...new Set(
      raw
        .split(',')
        .map((v) => v.trim().toLowerCase())
        .filter(Boolean)
    )
  ]
}

const uiStore = useUIStore()
const importFolderStore = useImportFolderStore()
const collectionStore = useCollectionStore()

const open = computed({
  get: () => uiStore.activeModals.includes('import-folder'),
  set: (val: boolean) => {
    if (!val) handleClose()
  }
})

const editingFolder = computed(() => {
  if (!importFolderStore.editingFolderId) return null
  return (
    importFolderStore.folders.find((f) => f.id === importFolderStore.editingFolderId) ?? null
  )
})

const isEditing = computed(() => !!editingFolder.value)

const manualCollections = computed(() =>
  collectionStore.collections.filter((c) => c.type !== 'special')
)

const collectionItems = computed(() => [
  { label: 'No collection', value: NONE_COLLECTION_VALUE },
  ...manualCollections.value.map((c) => ({ label: c.name, value: c.id }))
])

// Form state
const folderPath = ref('')
const name = ref('')
const importMode = ref<ImportFolderMode>('copy')
const targetCollectionId = ref(NONE_COLLECTION_VALUE)
const defaultKeywords = ref('')
const persist = ref(true)
const recursive = ref(true)
const autoImport = ref(false)
const saving = ref(false)
const error = ref<string | null>(null)

const canSave = computed(
  () => folderPath.value.trim().length > 0 && name.value.trim().length > 0 && !saving.value
)

// Reset form when modal opens/closes
watch(open, (isOpen) => {
  if (!isOpen) {
    saving.value = false
    error.value = null
    return
  }

  const folder = editingFolder.value
  if (folder) {
    folderPath.value = folder.path
    name.value = folder.name
    importMode.value = folder.import_mode
    targetCollectionId.value = folder.target_collection_id ?? NONE_COLLECTION_VALUE
    defaultKeywords.value = (folder.initial_keywords ?? []).join(', ')
    persist.value = folder.persist
    recursive.value = folder.recursive
    autoImport.value = folder.auto_import
  } else {
    folderPath.value = ''
    name.value = ''
    importMode.value = 'copy'
    targetCollectionId.value = NONE_COLLECTION_VALUE
    defaultKeywords.value = ''
    persist.value = true
    recursive.value = true
    autoImport.value = false
  }

  saving.value = false
  error.value = null
})

// Clear auto-import when persist is disabled
watch(persist, (val) => {
  if (!val) autoImport.value = false
})

function handleClose(): void {
  uiStore.closeModal('import-folder')
  importFolderStore.setEditingFolderId(null)
}

async function browseFolder(): Promise<void> {
  const selected = await window.api.showOpenDialog({
    title: 'Choose import folder',
    properties: ['openDirectory']
  })
  if (!selected || selected.length === 0) return

  folderPath.value = selected[0]
  if (!name.value.trim()) {
    name.value = basenameFromPath(selected[0])
  }
}

async function handleSave(): Promise<void> {
  if (!canSave.value) return

  saving.value = true
  error.value = null

  try {
    const keywords = parseKeywords(defaultKeywords.value)
    const collectionId =
      targetCollectionId.value === NONE_COLLECTION_VALUE ? undefined : targetCollectionId.value

    if (editingFolder.value) {
      await importFolderStore.updateFolder({
        id: editingFolder.value.id,
        name: name.value.trim(),
        import_mode: importMode.value,
        recursive: recursive.value,
        persist: persist.value,
        auto_import: persist.value ? autoImport.value : false,
        target_collection_id: collectionId,
        initial_keywords: keywords
      })
    } else {
      await importFolderStore.startImport({
        name: name.value.trim(),
        path: folderPath.value.trim(),
        import_mode: importMode.value,
        recursive: recursive.value,
        persist: persist.value,
        auto_import: persist.value ? autoImport.value : false,
        target_collection_id: collectionId,
        initial_keywords: keywords
      })
    }

    handleClose()
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    saving.value = false
  }
}

async function handleDelete(): Promise<void> {
  if (!editingFolder.value) return

  saving.value = true
  error.value = null

  try {
    await importFolderStore.deleteFolder(editingFolder.value.id)
    handleClose()
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <UModal
    v-model:open="open"
    :title="isEditing ? 'Edit Import Source' : 'Import Folder'"
    :description="
      isEditing
        ? 'Update saved source settings.'
        : 'Choose a folder and import mode, then start importing images.'
    "
  >
    <template #body>
      <div class="space-y-4">
        <!-- Folder path -->
        <UFormField label="Folder path">
          <div class="flex items-center gap-2">
            <UInput
              :model-value="folderPath"
              readonly
              class="flex-1"
              placeholder="Select a folder..."
            />
            <UButton
              icon="i-lucide-folder-open"
              color="neutral"
              variant="subtle"
              :disabled="saving || isEditing"
              @click="browseFolder"
            />
          </div>
        </UFormField>

        <!-- Name -->
        <UFormField label="Name">
          <UInput
            v-model="name"
            placeholder="Folder name"
            :maxlength="120"
            :disabled="saving"
          />
        </UFormField>

        <!-- Import mode -->
        <UFormField label="Import mode">
          <URadioGroup
            v-model="importMode"
            :items="IMPORT_MODE_ITEMS"
          />
          <p v-if="importMode === 'move'" class="mt-1 text-xs text-warning">
            Move mode removes originals from the source folder.
          </p>
        </UFormField>

        <USeparator />

        <!-- Target collection -->
        <UFormField label="Add to collection">
          <USelect
            v-model="targetCollectionId"
            :items="collectionItems"
            class="w-full"
          />
        </UFormField>

        <!-- Keywords -->
        <UFormField label="Default keywords">
          <UInput
            v-model="defaultKeywords"
            placeholder="portrait, lighting, concept"
            :disabled="saving"
          />
        </UFormField>

        <USeparator />

        <!-- Switches -->
        <div class="space-y-3">
          <USwitch
            v-model="persist"
            label="Remember this folder"
            :disabled="saving"
          />

          <USwitch
            v-model="recursive"
            label="Include subfolders"
            :disabled="saving"
          />

          <USwitch
            v-if="persist"
            v-model="autoImport"
            label="Auto-scan on launch"
            :disabled="saving"
            class="ml-4 border-l pl-3"
          />
        </div>

        <!-- Error -->
        <p v-if="error" class="text-sm text-error">{{ error }}</p>
      </div>
    </template>

    <template #footer>
      <div class="flex w-full items-center gap-2">
        <UButton
          v-if="isEditing"
          icon="i-lucide-trash-2"
          label="Delete"
          color="error"
          variant="soft"
          :disabled="saving"
          class="mr-auto"
          @click="handleDelete"
        />
        <UButton
          label="Cancel"
          color="neutral"
          variant="outline"
          :disabled="saving"
          @click="handleClose"
        />
        <UButton
          :label="saving ? 'Saving…' : isEditing ? 'Save Changes' : 'Start Import'"
          :disabled="!canSave"
          @click="handleSave"
        />
      </div>
    </template>
  </UModal>
</template>
