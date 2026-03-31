<script setup lang="ts">
import { ref, watch } from 'vue'
import Tag from 'primevue/tag'

import PaneBody from '@/components/panes/PaneBody.vue'
import PaneGate from '@/components/panes/PaneGate.vue'
import PaneLayout from '@/components/panes/PaneLayout.vue'
import { useGenerationStore } from '@/stores/generation'
import { useUIStore } from '@/stores/ui'
import { formatRelative } from '@/lib/format'
import type { GenerationRecord, GenerationStatus } from '@/types'

const generationStore = useGenerationStore()
const uiStore = useUIStore()

// ---------------------------------------------------------------------------
// Thumbnails — batch-fetched whenever the generation list changes
// ---------------------------------------------------------------------------

const thumbs = ref<Record<string, string>>({})

watch(
  () => generationStore.generations,
  async (gens) => {
    const ids = gens.map((g) => g.id)
    if (ids.length === 0) {
      thumbs.value = {}
      return
    }
    thumbs.value = await window.api.timeline.getThumbnailsBatch(ids).catch(() => ({}))
  },
  { immediate: true }
)

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function statusSeverity(status: GenerationStatus): 'success' | 'danger' | 'secondary' {
  if (status === 'completed') return 'success'
  if (status === 'failed') return 'danger'
  return 'secondary'
}

function formatTime(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`
}

function openDetail(gen: GenerationRecord): void {
  generationStore.setDetailGenerationId(gen.id)
  uiStore.openModal('generation-detail')
}
</script>

<template>
  <PaneLayout title="Timeline">
    <PaneGate v-if="generationStore.generations.length === 0" message="No generations yet" />

    <PaneBody v-else>
      <div class="space-y-2">
        <div
          v-for="gen in generationStore.generations"
          :key="gen.id"
          class="cursor-pointer rounded-lg border border-default bg-elevated p-2.5 transition-colors hover:bg-hover"
          @click="openDetail(gen)"
        >
          <div class="min-w-0 space-y-2">
            <!-- Status row -->
            <div class="flex items-center justify-between gap-2">
              <div class="flex min-w-0 items-center gap-2">
                <Tag
                  :value="gen.status"
                  :severity="statusSeverity(gen.status)"
                  class="text-[10px] capitalize"
                />
                <span class="shrink-0 text-xs font-medium text-muted">#{{ gen.number }}</span>
              </div>
              <span class="shrink-0 text-xs text-muted">{{ formatRelative(gen.created_at) }}</span>
            </div>

            <!-- Model + time -->
            <div class="flex min-w-0 items-center gap-2 text-xs text-muted">
              <span class="min-w-0 flex-1 truncate">{{ gen.model_file ?? 'Model' }}</span>
              <span v-if="gen.total_time_ms" class="shrink-0 tabular-nums">
                {{ formatTime(gen.total_time_ms) }}
              </span>
            </div>

            <!-- Error -->
            <div v-if="gen.error" class="truncate text-xs text-red-400">
              {{ gen.error }}
            </div>

            <!-- Thumbnail -->
            <div v-if="thumbs[gen.id]" class="flex justify-start">
              <div
                class="relative size-20 overflow-hidden rounded border border-default bg-elevated p-1"
              >
                <img
                  :src="thumbs[gen.id]"
                  :alt="`Output for #${gen.number}`"
                  class="size-full object-contain"
                  draggable="false"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </PaneBody>
  </PaneLayout>
</template>
