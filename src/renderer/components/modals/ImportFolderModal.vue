<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Icon } from '@iconify/vue'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import Select from 'primevue/select'
import RadioButton from 'primevue/radiobutton'
import ToggleSwitch from 'primevue/toggleswitch'
import Divider from 'primevue/divider'

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
  <Dialog
    v-model:visible="open"
    :header="isEditing ? 'Edit Import Source' : 'Import Folder'"
    modal
    :closable="true"
    :style="{ width: '32rem' }"
  >
    <p class="mb-4 text-sm text-muted">
      {{
        isEditing
          ? 'Update saved source settings.'
          : 'Choose a folder and import mode, then start importing images.'
      }}
    </p>

    <div class="space-y-4">
      <!-- Folder path -->
      <div>
        <label class="mb-1 block text-sm font-medium">Folder path</label>
        <div class="flex items-center gap-2">
          <InputText
            :model-value="folderPath"
            readonly
            class="flex-1"
            placeholder="Select a folder..."
          />
          <Button
            severity="secondary"
            outlined
            :disabled="saving || isEditing"
            @click="browseFolder"
          >
            <Icon icon="lucide:folder-open" class="size-4" />
          </Button>
        </div>
      </div>

      <!-- Name -->
      <div>
        <label class="mb-1 block text-sm font-medium">Name</label>
        <InputText
          v-model="name"
          placeholder="Folder name"
          :maxlength="120"
          :disabled="saving"
          class="w-full"
        />
      </div>

      <!-- Import mode -->
      <div>
        <label class="mb-1 block text-sm font-medium">Import mode</label>
        <div class="flex flex-col gap-2">
          <div v-for="item in IMPORT_MODE_ITEMS" :key="item.value" class="flex items-center gap-2">
            <RadioButton
              v-model="importMode"
              :input-id="'mode-' + item.value"
              :value="item.value"
            />
            <label :for="'mode-' + item.value" class="text-sm">{{ item.label }}</label>
          </div>
        </div>
        <p v-if="importMode === 'move'" class="mt-1 text-xs text-warning">
          Move mode removes originals from the source folder.
        </p>
      </div>

      <Divider />

      <!-- Target collection -->
      <div>
        <label class="mb-1 block text-sm font-medium">Add to collection</label>
        <Select
          v-model="targetCollectionId"
          :options="collectionItems"
          option-label="label"
          option-value="value"
          class="w-full"
        />
      </div>

      <!-- Keywords -->
      <div>
        <label class="mb-1 block text-sm font-medium">Default keywords</label>
        <InputText
          v-model="defaultKeywords"
          placeholder="portrait, lighting, concept"
          :disabled="saving"
          class="w-full"
        />
      </div>

      <Divider />

      <!-- Switches -->
      <div class="space-y-3">
        <div class="flex items-center gap-2">
          <ToggleSwitch v-model="persist" :disabled="saving" />
          <label class="text-sm">Remember this folder</label>
        </div>

        <div class="flex items-center gap-2">
          <ToggleSwitch v-model="recursive" :disabled="saving" />
          <label class="text-sm">Include subfolders</label>
        </div>

        <div v-if="persist" class="ml-4 flex items-center gap-2 border-l pl-3">
          <ToggleSwitch v-model="autoImport" :disabled="saving" />
          <label class="text-sm">Auto-scan on launch</label>
        </div>
      </div>

      <!-- Error -->
      <p v-if="error" class="text-sm text-error">{{ error }}</p>
    </div>

    <template #footer>
      <div class="flex w-full items-center gap-2">
        <Button
          v-if="isEditing"
          severity="danger"
          text
          :disabled="saving"
          class="mr-auto"
          @click="handleDelete"
        >
          <Icon icon="lucide:trash-2" class="size-4" />
          Delete
        </Button>
        <Button
          label="Cancel"
          severity="secondary"
          outlined
          :disabled="saving"
          @click="handleClose"
        />
        <Button
          :label="saving ? 'Saving…' : isEditing ? 'Save Changes' : 'Start Import'"
          :disabled="!canSave"
          @click="handleSave"
        />
      </div>
    </template>
  </Dialog>
</template>
