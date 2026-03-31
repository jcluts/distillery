<script setup lang="ts">
import { computed, watch } from 'vue'
import { Icon } from '@iconify/vue'
import Button from 'primevue/button'
import Slider from 'primevue/slider'

import PaneActions from '@/components/panes/primitives/PaneActions.vue'
import PaneBody from '@/components/panes/primitives/PaneBody.vue'
import PaneField from '@/components/panes/primitives/PaneField.vue'
import PaneGate from '@/components/panes/primitives/PaneGate.vue'
import PaneLayout from '@/components/panes/primitives/PaneLayout.vue'
import PaneSection from '@/components/panes/primitives/PaneSection.vue'
import ListItem from '@/components/shared/ListItem.vue'
import { useLibraryStore } from '@/stores/library'
import { useRemovalStore } from '@/stores/removal'
import { useUIStore } from '@/stores/ui'

const libraryStore = useLibraryStore()
const uiStore = useUIStore()
const removalStore = useRemovalStore()

const focusedItem = computed(() => {
  if (!libraryStore.focusedId) return null
  return libraryStore.items.find((item) => item.id === libraryStore.focusedId) ?? null
})

const data = computed(() =>
  libraryStore.focusedId ? removalStore.dataByMediaId[libraryStore.focusedId] ?? null : null
)

const staleOperationIds = computed(() =>
  libraryStore.focusedId
    ? removalStore.staleOperationIdsByMediaId[libraryStore.focusedId] ?? []
    : []
)

const staleIdSet = computed(() => new Set(staleOperationIds.value))

const staleEnabledCount = computed(() =>
  (data.value?.operations ?? []).filter(
    (op) => op.enabled && staleIdSet.value.has(op.id)
  ).length
)

const isPaintTarget = computed(
  () => removalStore.paintMode && removalStore.paintMediaId === focusedItem.value?.id
)

const canUndo = computed(() => removalStore.strokeHistoryIndex > 0)
const hasDraft = computed(() => removalStore.draftStrokes.length > 0)

const brushSizePercent = computed(() => Math.round(removalStore.brushSizeNormalized * 100))
const featherPercent = computed(() => Math.round(removalStore.featherRadiusNormalized * 100))

const mediaProgress = computed(() => {
  const ev = removalStore.progressEvent
  if (!ev || ev.mediaId !== focusedItem.value?.id) return null
  return ev
})

// Load removal data when focused image changes
watch(
  () => focusedItem.value,
  (item) => {
    if (item?.media_type === 'image') {
      void removalStore.loadData(item.id)
    }
  },
  { immediate: true }
)

// Gate conditions
const noSelection = computed(() => !focusedItem.value)
const notImage = computed(() => focusedItem.value && focusedItem.value.media_type !== 'image')
const notLoupe = computed(() => uiStore.viewMode !== 'loupe')

function formatTimestamp(iso: string): string {
  const date = new Date(iso)
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  })
}

function getOperationStatus(opId: string, enabled: boolean): string {
  if (removalStore.refreshingOperationIds.has(opId)) return 'Refreshing'
  if (removalStore.processingOperationIds.has(opId)) return 'Processing'
  if (staleIdSet.value.has(opId)) return 'Needs Refresh'
  return enabled ? 'Applied' : 'Hidden'
}

function isOperationBusy(opId: string): boolean {
  return removalStore.refreshingOperationIds.has(opId) || removalStore.processingOperationIds.has(opId)
}
</script>

<template>
  <PaneLayout title="Removals">
    <PaneGate v-if="noSelection" message="Select an image to remove objects" />
    <PaneGate v-else-if="notImage" message="Removals are available for images only" />
    <PaneGate v-else-if="notLoupe" message="Open an image in loupe view to use removals" />

    <PaneBody v-else>
      <!-- Brush controls -->
      <PaneSection title="Brush">
        <div class="space-y-3">
          <PaneField label="Mode">
            <div class="flex gap-1">
              <Button
                size="small"
                :outlined="removalStore.tool !== 'paint'"
                :severity="removalStore.tool === 'paint' ? undefined : 'secondary'"
                class="justify-center"
                @click="removalStore.setTool('paint')"
              >
                Paint
              </Button>
              <Button
                size="small"
                :outlined="removalStore.tool !== 'erase'"
                :severity="removalStore.tool === 'erase' ? undefined : 'secondary'"
                class="justify-center"
                @click="removalStore.setTool('erase')"
              >
                Erase
              </Button>
            </div>
          </PaneField>

          <PaneField label="Size">
            <div class="flex items-center gap-3">
              <Slider
                :model-value="removalStore.brushSizeNormalized * 100"
                :min="0.4"
                :max="25"
                :step="0.1"
                class="flex-1"
                @update:model-value="(v: number | number[]) => { const n = Array.isArray(v) ? v[0] : v; if (n != null) removalStore.setBrushSizeNormalized(n / 100) }"
              />
              <span class="w-8 shrink-0 text-right text-xs text-muted">{{ brushSizePercent }}%</span>
            </div>
          </PaneField>

          <PaneField label="Feather">
            <div class="flex items-center gap-3">
              <Slider
                :model-value="removalStore.featherRadiusNormalized * 100"
                :min="0"
                :max="20"
                :step="0.1"
                class="flex-1"
                @update:model-value="(v: number | number[]) => { const n = Array.isArray(v) ? v[0] : v; if (n != null) removalStore.setFeatherRadiusNormalized(n / 100) }"
              />
              <span class="w-8 shrink-0 text-right text-xs text-muted">{{ featherPercent }}%</span>
            </div>
          </PaneField>

          <PaneActions>
            <Button
              outlined
              severity="secondary"
              size="small"
              :disabled="!isPaintTarget || !canUndo"
              @click="removalStore.undoStroke()"
            >
              <Icon icon="lucide:undo-2" class="size-4" />
              Undo
            </Button>
            <Button
              outlined
              severity="secondary"
              size="small"
              :disabled="!isPaintTarget || !hasDraft"
              @click="removalStore.clearDraftStrokes()"
            >
              <Icon icon="lucide:trash-2" class="size-4" />
              Clear
            </Button>
          </PaneActions>
        </div>
      </PaneSection>

      <!-- Paint Mask / Apply + Cancel -->
      <PaneActions v-if="!isPaintTarget" stack>
        <Button
          outlined
          severity="secondary"
          @click="removalStore.enterPaintMode(focusedItem!.id)"
        >
          <Icon icon="lucide:brush" class="size-4" />
          Paint Mask
        </Button>
      </PaneActions>
      <PaneActions v-else>
        <Button
          :disabled="!hasDraft"
          @click="removalStore.applyDraft()"
        >
          <Icon icon="lucide:check" class="size-4" />
          Apply
        </Button>
        <Button
          outlined
          severity="secondary"
          @click="removalStore.cancelPaintMode()"
        >
          <Icon icon="lucide:x" class="size-4" />
          Cancel
        </Button>
      </PaneActions>

      <!-- Progress -->
      <div
        v-if="mediaProgress && mediaProgress.phase !== 'complete' && mediaProgress.phase !== 'error'"
        class="flex items-center gap-2 rounded-md border border-default bg-elevated px-3 py-2 text-xs text-muted"
      >
        <Icon icon="lucide:loader-2" class="size-3.5 animate-spin" />
        <span>{{ mediaProgress.message ?? `Phase: ${mediaProgress.phase}` }}</span>
      </div>

      <!-- Error -->
      <div
        v-if="removalStore.lastError"
        class="rounded-md border border-error/30 bg-error/10 px-3 py-2 text-xs text-error"
      >
        {{ removalStore.lastError }}
      </div>

      <!-- Operations list -->
      <PaneSection v-if="(data?.operations.length ?? 0) > 0" title="Operations">
        <div class="space-y-1.5">
          <ListItem
            v-for="(operation, index) in data!.operations"
            :key="operation.id"
          >
            <p class="truncate text-xs font-medium">
              Removal {{ index + 1 }}
              <span class="font-normal text-muted">· {{ getOperationStatus(operation.id, operation.enabled) }}</span>
            </p>
            <p class="text-xs text-muted">{{ formatTimestamp(operation.timestamp) }}</p>
            <template #actions>
              <Button
                text
                plain
                severity="secondary"
                size="small"
                :aria-label="operation.enabled ? 'Hide removal' : 'Show removal'"
                @click.stop="removalStore.toggleOperation(focusedItem!.id, operation.id, !operation.enabled)"
              >
                <Icon :icon="operation.enabled ? 'lucide:eye' : 'lucide:eye-off'" class="size-4" />
              </Button>

              <Button
                v-if="staleIdSet.has(operation.id)"
                text
                plain
                severity="secondary"
                size="small"
                :disabled="isOperationBusy(operation.id)"
                :class="{ 'animate-spin': isOperationBusy(operation.id) }"
                aria-label="Refresh removal"
                @click.stop="removalStore.refreshOperation(focusedItem!.id, operation.id)"
              >
                <Icon icon="lucide:refresh-ccw" class="size-4" />
              </Button>

              <Button
                text
                plain
                severity="secondary"
                size="small"
                aria-label="Delete removal"
                @click.stop="removalStore.deleteOperation(focusedItem!.id, operation.id)"
              >
                <Icon icon="lucide:trash-2" class="size-4" />
              </Button>
            </template>
          </ListItem>
        </div>

        <PaneActions v-if="staleEnabledCount > 0" stack class="mt-2">
          <Button
            outlined
            severity="secondary"
            @click="removalStore.refreshAllStale(focusedItem!.id)"
          >
            Refresh All ({{ staleEnabledCount }})
          </Button>
        </PaneActions>
      </PaneSection>
    </PaneBody>
  </PaneLayout>
</template>
