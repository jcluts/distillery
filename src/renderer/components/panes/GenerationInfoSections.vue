<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import Button from 'primevue/button'
import Tag from 'primevue/tag'

import ImagePreviewModal from '@/components/modals/ImagePreviewModal.vue'
import PaneActions from '@/components/panes/primitives/PaneActions.vue'
import PaneGate from '@/components/panes/primitives/PaneGate.vue'
import PaneSection from '@/components/panes/primitives/PaneSection.vue'
import { useGenerationStore } from '@/stores/generation'
import { useLibraryStore } from '@/stores/library'
import { useUIStore } from '@/stores/ui'
import type { GenerationInput, GenerationRecord } from '@/types'

const props = withDefaults(
  defineProps<{
    showUnavailableGate?: boolean
    actionsTitle?: string
  }>(),
  {
    showUnavailableGate: true,
    actionsTitle: 'Actions'
  }
)

const libraryStore = useLibraryStore()
const generationStore = useGenerationStore()
const uiStore = useUIStore()

// ---------------------------------------------------------------------------
// Derived state
// ---------------------------------------------------------------------------

const media = computed(() => {
  if (!libraryStore.focusedId) return null
  return libraryStore.items.find((m) => m.id === libraryStore.focusedId) ?? null
})

const isGenerated = computed(() => media.value?.origin === 'generation')

const gen = ref<GenerationRecord | null>(null)
const inputs = ref<GenerationInput[]>([])
const previewOpen = ref(false)
const previewSrc = ref<string | null>(null)
const previewAlt = ref('Reference image')

watch(
  () => media.value?.generation_id,
  async (genId) => {
    if (!genId) {
      gen.value = null
      inputs.value = []
      return
    }

    gen.value = generationStore.generations.find((g) => g.id === genId) ?? null

    const [record, genInputs] = await Promise.all([
      window.api.timeline.get(genId).catch(() => null),
      window.api.timeline.getGenerationInputs(genId).catch(() => [] as GenerationInput[])
    ])

    if (record) gen.value = record
    inputs.value = genInputs
  },
  { immediate: true }
)

// ---------------------------------------------------------------------------
// Parameter rows
// ---------------------------------------------------------------------------

interface InfoRow {
  label: string
  value: string | number
}

const paramRows = computed<InfoRow[]>(() => {
  const g = gen.value
  if (!g) return []

  const rows: InfoRow[] = [
    { label: 'Provider', value: g.provider ?? '-' },
    { label: 'Model', value: g.model_file ?? '-' },
    { label: 'Resolution', value: g.width && g.height ? `${g.width} x ${g.height}` : '-' },
    { label: 'Seed', value: g.seed ?? '-' },
    { label: 'Steps', value: g.steps ?? '-' },
    { label: 'Guidance', value: g.guidance ?? '-' }
  ]

  if (g.total_time_ms) {
    rows.push({ label: 'Time', value: `${(g.total_time_ms / 1000).toFixed(1)}s` })
  }

  return rows
})

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

function openDetail(): void {
  if (!gen.value) return
  generationStore.setDetailGenerationId(gen.value.id)
  uiStore.openModal('generation-detail')
}

function reloadSettings(): void {
  if (!gen.value) return
  uiStore.setLeftPanelTab('generation')
  void generationStore.reloadFromGeneration(gen.value.id)
}

function openInputPreview(input: GenerationInput): void {
  previewSrc.value = input.preview_file_path ?? input.thumb_path
  previewAlt.value = input.original_filename ?? 'Reference'
  previewOpen.value = true
}
</script>

<template>
  <PaneGate v-if="!media && props.showUnavailableGate" message="No selection" />
  <PaneGate v-else-if="!isGenerated && props.showUnavailableGate" message="Not a generated item" />

  <template v-else-if="isGenerated">
    <PaneSection title="Prompt">
      <div
        class="max-h-48 min-h-48 overflow-y-auto whitespace-pre-wrap break-words rounded border border-default bg-elevated p-2 text-sm"
      >
        {{ gen?.prompt ?? '-' }}
      </div>
    </PaneSection>

    <PaneSection title="Parameters">
      <dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
        <template v-for="row in paramRows" :key="row.label">
          <dt class="text-muted">{{ row.label }}</dt>
          <dd class="truncate">{{ row.value }}</dd>
        </template>
      </dl>
    </PaneSection>

    <PaneSection title="Reference Images">
      <div v-if="inputs.length === 0" class="text-xs text-muted">None</div>
      <div v-else class="flex items-center gap-2 overflow-x-auto">
        <button
          v-for="input in inputs"
          :key="input.id"
          type="button"
          class="relative size-20 shrink-0 overflow-hidden rounded border border-default bg-elevated p-0"
          :title="input.original_filename ?? ''"
          @click="openInputPreview(input)"
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
    </PaneSection>

    <PaneSection :title="props.actionsTitle">
      <PaneActions stack>
        <Button
          label="View Full Details"
          outlined
          severity="secondary"
          size="small"
          :disabled="!gen"
          @click="openDetail"
        />
        <Button
          label="Reload Settings"
          outlined
          severity="secondary"
          size="small"
          :disabled="!gen"
          @click="reloadSettings"
        />
      </PaneActions>
    </PaneSection>
  </template>

  <ImagePreviewModal v-model:open="previewOpen" :src="previewSrc" :alt="previewAlt" />
</template>
