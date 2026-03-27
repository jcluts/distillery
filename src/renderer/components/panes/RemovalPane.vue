<script setup lang="ts">
import { computed, watch } from 'vue'

import PaneLayout from '@/components/panes/PaneLayout.vue'
import PaneSection from '@/components/panes/PaneSection.vue'
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
    <!-- Gate: no selection -->
    <div v-if="noSelection" class="flex items-center justify-center px-4 py-8 text-sm text-muted">
      Select an image to remove objects
    </div>

    <!-- Gate: not an image -->
    <div v-else-if="notImage" class="flex items-center justify-center px-4 py-8 text-sm text-muted">
      Removals are available for images only
    </div>

    <!-- Gate: not in loupe view -->
    <div v-else-if="notLoupe" class="flex items-center justify-center px-4 py-8 text-sm text-muted">
      Open an image in loupe view to use removals
    </div>

    <!-- Main content -->
    <div v-else class="space-y-4">
      <!-- Tool toggle -->
      <PaneSection title="Mode">
        <div class="flex gap-1">
          <UButton
            size="xs"
            :variant="removalStore.tool === 'paint' ? 'soft' : 'outline'"
            :color="removalStore.tool === 'paint' ? 'primary' : 'neutral'"
            class="justify-center"
            @click="removalStore.setTool('paint')"
          >
            Paint
          </UButton>
          <UButton
            size="xs"
            :variant="removalStore.tool === 'erase' ? 'soft' : 'outline'"
            :color="removalStore.tool === 'erase' ? 'primary' : 'neutral'"
            class="justify-center"
            @click="removalStore.setTool('erase')"
          >
            Erase
          </UButton>
        </div>
      </PaneSection>

      <!-- Brush Size -->
      <PaneSection title="Brush Size">
        <div class="flex items-center gap-3">
          <USlider
            :model-value="removalStore.brushSizeNormalized * 100"
            :min="0.4"
            :max="25"
            :step="0.1"
            class="flex-1"
            @update:model-value="(v: number | undefined) => v != null && removalStore.setBrushSizeNormalized(v / 100)"
          />
          <span class="w-8 shrink-0 text-right text-xs text-muted">{{ brushSizePercent }}%</span>
        </div>
      </PaneSection>

      <!-- Feather -->
      <PaneSection title="Feather">
        <div class="flex items-center gap-3">
          <USlider
            :model-value="removalStore.featherRadiusNormalized * 100"
            :min="0"
            :max="20"
            :step="0.1"
            class="flex-1"
            @update:model-value="(v: number | undefined) => v != null && removalStore.setFeatherRadiusNormalized(v / 100)"
          />
          <span class="w-8 shrink-0 text-right text-xs text-muted">{{ featherPercent }}%</span>
        </div>
      </PaneSection>

      <!-- Undo / Clear -->
      <div class="flex gap-2">
        <UButton
          icon="i-lucide-undo-2"
          color="neutral"
          variant="outline"
          size="sm"
          class="flex-1 justify-center"
          :disabled="!isPaintTarget || !canUndo"
          @click="removalStore.undoStroke()"
        >
          Undo
        </UButton>
        <UButton
          icon="i-lucide-trash-2"
          color="neutral"
          variant="outline"
          size="sm"
          class="flex-1 justify-center"
          :disabled="!isPaintTarget || !hasDraft"
          @click="removalStore.clearDraftStrokes()"
        >
          Clear
        </UButton>
      </div>

      <!-- Paint Mask / Apply + Cancel -->
      <div>
        <div v-if="!isPaintTarget">
          <UButton
            icon="i-lucide-brush"
            color="neutral"
            variant="outline"
            class="w-full justify-center"
            @click="removalStore.enterPaintMode(focusedItem!.id)"
          >
            Paint Mask
          </UButton>
        </div>
        <div v-else class="flex gap-2">
          <UButton
            icon="i-lucide-check"
            color="primary"
            class="flex-1 justify-center"
            :disabled="!hasDraft"
            @click="removalStore.applyDraft()"
          >
            Apply
          </UButton>
          <UButton
            icon="i-lucide-x"
            color="neutral"
            variant="outline"
            class="flex-1 justify-center"
            @click="removalStore.cancelPaintMode()"
          >
            Cancel
          </UButton>
        </div>
      </div>

      <!-- Progress -->
      <div
        v-if="mediaProgress && mediaProgress.phase !== 'complete' && mediaProgress.phase !== 'error'"
        class="flex items-center gap-2 rounded-md border border-default bg-elevated px-3 py-2 text-xs text-muted"
      >
        <UIcon name="i-lucide-loader-2" class="size-3.5 animate-spin" />
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
          <div
            v-for="(operation, index) in data!.operations"
            :key="operation.id"
            class="flex items-center gap-2 rounded-lg border border-muted px-2.5 py-2"
          >
            <div class="min-w-0 flex-1">
              <p class="truncate text-xs font-medium text-default">
                Removal {{ index + 1 }}
                <span class="font-normal text-muted">· {{ getOperationStatus(operation.id, operation.enabled) }}</span>
              </p>
              <p class="text-xs text-muted">{{ formatTimestamp(operation.timestamp) }}</p>
            </div>

            <div class="flex shrink-0 items-center gap-1">
              <UButton
                :icon="operation.enabled ? 'i-lucide-eye' : 'i-lucide-eye-off'"
                color="neutral"
                variant="ghost"
                size="xs"
                square
                :aria-label="operation.enabled ? 'Hide removal' : 'Show removal'"
                @click="removalStore.toggleOperation(focusedItem!.id, operation.id, !operation.enabled)"
              />

              <UButton
                v-if="staleIdSet.has(operation.id)"
                icon="i-lucide-refresh-ccw"
                color="neutral"
                variant="ghost"
                size="xs"
                square
                :disabled="isOperationBusy(operation.id)"
                :class="{ 'animate-spin': isOperationBusy(operation.id) }"
                aria-label="Refresh removal"
                @click="removalStore.refreshOperation(focusedItem!.id, operation.id)"
              />

              <UButton
                icon="i-lucide-trash-2"
                color="neutral"
                variant="ghost"
                size="xs"
                square
                aria-label="Delete removal"
                @click="removalStore.deleteOperation(focusedItem!.id, operation.id)"
              />
            </div>
          </div>
        </div>

        <UButton
          v-if="staleEnabledCount > 0"
          color="neutral"
          variant="outline"
          class="mt-2 w-full justify-center"
          @click="removalStore.refreshAllStale(focusedItem!.id)"
        >
          Refresh All ({{ staleEnabledCount }})
        </UButton>
      </PaneSection>
    </div>
  </PaneLayout>
</template>
