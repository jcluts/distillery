<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import Tag from 'primevue/tag'

import ImagePreviewModal from '@/components/modals/ImagePreviewModal.vue'
import { useGenerationStore } from '@/stores/generation'
import { useUIStore } from '@/stores/ui'
import type { GenerationInput, GenerationRecord } from '@/types'

const uiStore = useUIStore()
const generationStore = useGenerationStore()

// ---------------------------------------------------------------------------
// Visibility
// ---------------------------------------------------------------------------

const open = computed({
  get: () => uiStore.activeModals.includes('generation-detail'),
  set: (val: boolean) => {
    if (!val) close()
  }
})

// ---------------------------------------------------------------------------
// Data loading
// ---------------------------------------------------------------------------

const gen = ref<GenerationRecord | null>(null)
const inputs = ref<GenerationInput[]>([])
const outputThumb = ref<string | null>(null)

watch(
  [open, () => generationStore.detailGenerationId],
  async ([isOpen, genId]) => {
    if (!isOpen || !genId) {
      gen.value = null
      inputs.value = []
      outputThumb.value = null
      return
    }

    const [record, genInputs, thumb] = await Promise.all([
      window.api.timeline.get(genId).catch(() => null),
      window.api.timeline.getGenerationInputs(genId).catch(() => [] as GenerationInput[]),
      window.api.timeline.getThumbnail(genId).catch(() => null)
    ])

    gen.value = record
    inputs.value = genInputs
    outputThumb.value = thumb
  },
  { immediate: true }
)

// ---------------------------------------------------------------------------
// Parameter rows — reusable pattern from GenerationInfoPane
// ---------------------------------------------------------------------------

interface InfoRow {
  label: string
  value: string | number
}

const paramRows = computed<InfoRow[]>(() => {
  const g = gen.value
  if (!g) return []

  const rows: InfoRow[] = [
    { label: 'Provider', value: g.provider ?? '—' },
    { label: 'Model', value: g.model_file ?? '—' },
    { label: 'Resolution', value: g.width && g.height ? `${g.width} × ${g.height}` : '—' },
    { label: 'Seed', value: g.seed ?? '—' },
    { label: 'Steps', value: g.steps ?? '—' },
    { label: 'Guidance', value: g.guidance ?? '—' }
  ]

  if (g.total_time_ms) {
    rows.push({ label: 'Time', value: `${(g.total_time_ms / 1000).toFixed(1)}s` })
  }

  return rows
})

const fullError = computed(() => gen.value?.error?.trim() ?? '')

// ---------------------------------------------------------------------------
// Image preview modal
// ---------------------------------------------------------------------------

const previewOpen = ref(false)
const previewSrc = ref<string | null>(null)
const previewAlt = ref('Image preview')

function openPreview(src: string | null, alt: string): void {
  if (!src) return
  previewSrc.value = src
  previewAlt.value = alt
  previewOpen.value = true
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

function close(): void {
  uiStore.closeModal('generation-detail')
  generationStore.setDetailGenerationId(null)
}

async function reloadSettings(): Promise<void> {
  if (!gen.value) return
  uiStore.setLeftPanelTab('generation')
  await generationStore.reloadFromGeneration(gen.value.id)
  close()
}

async function removeFromTimeline(): Promise<void> {
  if (!generationStore.detailGenerationId) return
  await window.api.timeline.remove(generationStore.detailGenerationId)
  await generationStore.loadTimeline()
  close()
}

async function copyError(): Promise<void> {
  if (!fullError.value) return
  await navigator.clipboard.writeText(fullError.value)
}
</script>

<template>
  <Dialog
    v-model:visible="open"
    :header="gen ? `Generation #${gen.number}` : 'Generation'"
    modal
    :closable="true"
    :style="{ width: '48rem' }"
  >
    <div class="grid grid-cols-1 gap-6 md:grid-cols-2">
      <!-- Left column: Output + Reference images -->
      <div class="space-y-4">
        <div>
          <div class="mb-1.5 text-xs font-medium text-muted">Output</div>
          <div
            class="aspect-square w-full overflow-hidden rounded-lg border border-default bg-surface-100/30"
            :class="{ 'cursor-pointer': outputThumb }"
            @click="openPreview(outputThumb, 'Generation output')"
          >
            <img
              v-if="outputThumb"
              :src="outputThumb"
              alt="Generation output"
              class="size-full object-cover"
              draggable="false"
            />
            <div v-else class="flex size-full items-center justify-center text-xs text-muted">
              —
            </div>
          </div>
        </div>

        <div>
          <div class="mb-1.5 text-xs font-medium text-muted">Reference Images</div>
          <div v-if="inputs.length === 0" class="text-xs text-muted">None</div>
          <div v-else class="flex items-center gap-2 overflow-x-auto">
            <button
              v-for="input in inputs"
              :key="input.id"
              type="button"
              class="relative size-24 shrink-0 cursor-pointer overflow-hidden rounded border border-default bg-surface-100/30 p-0"
              :title="input.original_filename ?? ''"
              @click="
                openPreview(
                  input.preview_file_path ?? input.thumb_path,
                  input.original_filename ?? 'Reference'
                )
              "
            >
              <img
                :src="input.thumb_path"
                :alt="input.original_filename ?? 'Reference'"
                class="absolute inset-0 size-full object-cover"
                draggable="false"
              />
            </button>
            <Tag :value="String(inputs.length)" severity="secondary" />
          </div>
        </div>
      </div>

      <!-- Right column: Prompt + Parameters -->
      <div class="space-y-4">
        <div v-if="fullError">
          <div class="mb-1.5 flex items-center justify-between gap-2">
            <span class="text-xs font-medium text-muted">Error</span>
            <Button label="Copy" size="small" severity="secondary" text @click="copyError" />
          </div>
          <div
            class="max-h-40 overflow-y-auto whitespace-pre-wrap break-words rounded-lg border border-red-500/40 bg-red-950/20 p-2 font-mono text-xs text-red-200"
          >
            {{ fullError }}
          </div>
        </div>

        <div>
          <div class="mb-1.5 text-xs font-medium text-muted">Prompt</div>
          <div
            class="max-h-32 overflow-y-auto whitespace-pre-wrap break-words rounded-lg border border-default bg-surface-100/30 p-2 text-sm"
          >
            {{ gen?.prompt ?? '—' }}
          </div>
        </div>

        <div>
          <div class="mb-1.5 text-xs font-medium text-muted">Parameters</div>
          <dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
            <template v-for="row in paramRows" :key="row.label">
              <dt class="text-muted">{{ row.label }}</dt>
              <dd class="truncate">{{ row.value }}</dd>
            </template>
          </dl>
        </div>
      </div>
    </div>

    <template #footer>
      <div class="flex items-center justify-end gap-2">
        <Button
          label="Reload Settings"
          outlined
          severity="secondary"
          :disabled="!gen"
          @click="reloadSettings"
        />
        <Button
          label="Remove from Timeline"
          severity="danger"
          :disabled="!generationStore.detailGenerationId"
          @click="removeFromTimeline"
        />
      </div>
    </template>
  </Dialog>

  <ImagePreviewModal v-model:open="previewOpen" :src="previewSrc" :alt="previewAlt" />
</template>
