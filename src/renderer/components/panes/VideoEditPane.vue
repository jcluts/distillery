<script setup lang="ts">
import { computed, watch } from 'vue'
import { Icon } from '@iconify/vue'
import Button from 'primevue/button'

import PaneActions from '@/components/panes/primitives/PaneActions.vue'
import PaneBody from '@/components/panes/primitives/PaneBody.vue'
import PaneGate from '@/components/panes/primitives/PaneGate.vue'
import PaneLayout from '@/components/panes/primitives/PaneLayout.vue'
import PaneSection from '@/components/panes/primitives/PaneSection.vue'
import { formatDuration, formatTimecode } from '@/lib/media'
import { useLibraryStore } from '@/stores/library'
import { useUIStore } from '@/stores/ui'
import { useVideoEditStore } from '@/stores/video-edits'

const libraryStore = useLibraryStore()
const uiStore = useUIStore()
const videoEditStore = useVideoEditStore()

function formatFileSize(bytes: number | null | undefined): string {
  if (!bytes || !Number.isFinite(bytes)) return '—'
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const focusedItem = computed(() => {
  if (!libraryStore.focusedId) return null
  return libraryStore.items.find((item) => item.id === libraryStore.focusedId) ?? null
})

const noSelection = computed(() => !focusedItem.value)
const notVideo = computed(() => focusedItem.value?.media_type !== 'video')
const notLoupe = computed(() => uiStore.viewMode !== 'loupe')
const trimModeActive = computed(
  () => videoEditStore.trimMode && videoEditStore.activeMediaId === focusedItem.value?.id
)

const displayDuration = computed(
  () => videoEditStore.metadata?.duration ?? focusedItem.value?.duration ?? null
)

const displayWidth = computed(() => videoEditStore.metadata?.width ?? focusedItem.value?.width ?? null)
const displayHeight = computed(
  () => videoEditStore.metadata?.height ?? focusedItem.value?.height ?? null
)

const trimInTime = computed(() => videoEditStore.trimStart ?? 0)
const trimOutTime = computed(() => videoEditStore.trimEnd ?? displayDuration.value ?? 0)

const trimPercent = computed(() => {
  const duration = displayDuration.value
  if (!duration || duration <= 0) return null
  return Math.round((videoEditStore.trimmedDuration / duration) * 100)
})

watch(
  () => focusedItem.value,
  (item) => {
    if (item?.media_type === 'video') {
      videoEditStore.setActiveMedia(item.id)
      void videoEditStore.loadEdits(item.id)
      return
    }

    if (!item) {
      videoEditStore.clearSession()
    }
  },
  { immediate: true }
)

function handleToggleTrim(): void {
  if (!focusedItem.value) return

  if (trimModeActive.value) {
    videoEditStore.exitTrimMode()
    return
  }

  void videoEditStore.enterTrimMode(focusedItem.value.id)
}

function handleClearTrim(): void {
  if (!focusedItem.value) return
  void videoEditStore.clearTrim(focusedItem.value.id)
}

function handleResetAll(): void {
  if (!focusedItem.value) return
  void videoEditStore.clearTrim(focusedItem.value.id).finally(() => {
    videoEditStore.exitTrimMode()
  })
}
</script>

<template>
  <PaneLayout title="Video">
    <PaneGate v-if="noSelection" message="Select a video to edit" />
    <PaneGate v-else-if="notVideo" message="Use the Video pane for video editing" />
    <PaneGate v-else-if="notLoupe" message="Open a video in the loupe view to access trim controls" />

    <PaneBody v-else>
      <PaneSection title="Info">
        <dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 text-sm">
          <dt class="text-muted">Duration</dt>
          <dd class="text-right tabular-nums">{{ formatDuration(displayDuration) }}</dd>

          <dt class="text-muted">Resolution</dt>
          <dd class="text-right tabular-nums">
            {{ displayWidth && displayHeight ? `${displayWidth} × ${displayHeight}` : '—' }}
          </dd>

          <dt class="text-muted">File Size</dt>
          <dd class="text-right tabular-nums">{{ formatFileSize(focusedItem?.file_size) }}</dd>
        </dl>
      </PaneSection>

      <PaneSection title="Trim">
        <div class="space-y-3">
          <Button
            :outlined="trimModeActive"
            :severity="trimModeActive ? 'secondary' : undefined"
            class="w-full justify-center"
            @click="handleToggleTrim"
          >
            <Icon icon="lucide:scissors" class="size-4" />
            {{ trimModeActive ? 'Disable Trim' : 'Enable Trim' }}
          </Button>

          <div v-if="trimModeActive || videoEditStore.hasTrim" class="space-y-2 rounded-md border border-default bg-elevated px-3 py-3">
            <dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 text-sm">
              <dt class="text-muted">IN</dt>
              <dd class="text-right font-medium tabular-nums text-primary">
                {{ formatTimecode(trimInTime) }}
              </dd>

              <dt class="text-muted">OUT</dt>
              <dd class="text-right font-medium tabular-nums text-primary">
                {{ formatTimecode(trimOutTime) }}
              </dd>

              <dt class="text-muted">Duration</dt>
              <dd class="text-right tabular-nums">
                {{ formatTimecode(videoEditStore.trimmedDuration) }}
                <span v-if="trimPercent !== null" class="text-muted">({{ trimPercent }}%)</span>
              </dd>
            </dl>

            <p class="text-xs text-muted">Use I and O to set trim points in the player.</p>

            <Button
              v-if="videoEditStore.hasTrim"
              outlined
              severity="secondary"
              class="w-full justify-center"
              @click="handleClearTrim"
            >
              <Icon icon="lucide:x" class="size-4" />
              Clear Trim
            </Button>
          </div>
        </div>
      </PaneSection>

      <PaneSection v-if="videoEditStore.hasTrim" title="Reset">
        <PaneActions stack>
          <Button outlined severity="danger" @click="handleResetAll">
            <Icon icon="lucide:undo-2" class="size-4" />
            Reset All Edits
          </Button>
        </PaneActions>
      </PaneSection>
    </PaneBody>
  </PaneLayout>
</template>