<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import Button from 'primevue/button'
import Tag from 'primevue/tag'

import PaneBody from '@/components/panes/PaneBody.vue'
import PaneGate from '@/components/panes/PaneGate.vue'
import PaneLayout from '@/components/panes/PaneLayout.vue'
import PaneSection from '@/components/panes/PaneSection.vue'
import { useGenerationStore } from '@/stores/generation'
import { useLibraryStore } from '@/stores/library'
import { useUIStore } from '@/stores/ui'
import type { GenerationInput, GenerationRecord } from '@/types'

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

watch(
  () => media.value?.generation_id,
  async (genId) => {
    if (!genId) {
      gen.value = null
      inputs.value = []
      return
    }

    // Optimistic: show from store immediately if available
    gen.value = generationStore.generations.find((g) => g.id === genId) ?? null

    // Fetch authoritative data from main process
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

function navigateToInput(mediaId: string | null): void {
  if (!mediaId) return
  libraryStore.selectSingle(mediaId)
  uiStore.setViewMode('grid')
}
</script>

<template>
  <PaneLayout title="Generation Info">
    <PaneGate v-if="!media" message="No selection" />
    <PaneGate v-else-if="!isGenerated" message="Not a generated item" />

    <PaneBody v-else>
      <!-- Prompt -->
      <PaneSection title="Prompt">
        <div class="max-h-24 overflow-y-auto rounded border border-default bg-elevated p-2 text-sm">
          {{ gen?.prompt ?? '—' }}
        </div>
      </PaneSection>

      <!-- Parameters -->
      <PaneSection title="Parameters">
        <dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
          <template v-for="row in paramRows" :key="row.label">
            <dt class="text-muted">{{ row.label }}</dt>
            <dd class="truncate">{{ row.value }}</dd>
          </template>
        </dl>
      </PaneSection>

      <!-- Reference images -->
      <PaneSection title="Reference Images">
        <div v-if="inputs.length === 0" class="text-xs text-muted">None</div>
        <div v-else class="flex items-center gap-2 overflow-x-auto">
          <button
            v-for="input in inputs"
            :key="input.id"
            type="button"
            class="relative size-10 shrink-0 overflow-hidden rounded border border-default bg-elevated"
            :title="input.original_filename ?? ''"
            @click="navigateToInput(input.media_id)"
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

      <!-- Actions -->
      <PaneSection title="Actions">
        <div class="flex flex-col gap-2">
          <Button
            label="View Full Details"
            outlined
            severity="secondary"
            size="small"
            :disabled="!gen"
            class="w-full"
            @click="openDetail"
          />
          <Button
            label="Reload Settings"
            outlined
            severity="secondary"
            size="small"
            :disabled="!gen"
            class="w-full"
            @click="reloadSettings"
          />
        </div>
      </PaneSection>
    </PaneBody>
  </PaneLayout>
</template>
