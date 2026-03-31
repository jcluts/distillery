<script setup lang="ts">
import { computed, onBeforeUnmount, watch } from 'vue'
import { Icon } from '@iconify/vue'
import Button from 'primevue/button'

import PaneBody from '@/components/panes/primitives/PaneBody.vue'
import PaneGate from '@/components/panes/primitives/PaneGate.vue'
import PaneLayout from '@/components/panes/primitives/PaneLayout.vue'
import PaneSection from '@/components/panes/primitives/PaneSection.vue'
import AdjustmentSlider from '@renderer/components/shared/AdjustmentSlider.vue'
import {
  ADJUSTMENT_SLIDER_GROUPS,
  DEFAULT_IMAGE_ADJUSTMENTS,
  hasAdjustments
} from '@/lib/adjustment-constants'
import { useAdjustmentStore } from '@/stores/adjustment'
import { useLibraryStore } from '@/stores/library'
import { useUIStore } from '@/stores/ui'

const libraryStore = useLibraryStore()
const uiStore = useUIStore()
const adjustmentStore = useAdjustmentStore()

const selectedIds = computed(() => [...libraryStore.selectedIds])

const activeItem = computed(() => {
  if (selectedIds.value.length > 1) {
    return null
  }

  const candidateId = libraryStore.focusedId ?? selectedIds.value[0] ?? null
  if (!candidateId) {
    return null
  }

  return libraryStore.items.find((item) => item.id === candidateId) ?? null
})

const currentAdjustments = computed(() => {
  return activeItem.value
    ? adjustmentStore.getResolvedFor(activeItem.value.id)
    : DEFAULT_IMAGE_ADJUSTMENTS
})

const noSelection = computed(() => !activeItem.value && selectedIds.value.length === 0 && !libraryStore.focusedId)
const multipleSelection = computed(() => selectedIds.value.length > 1)
const notImage = computed(() => activeItem.value?.media_type === 'video')
const notLoupe = computed(() => uiStore.viewMode !== 'loupe')
const canInteract = computed(() => !!activeItem.value && activeItem.value.media_type === 'image' && !notLoupe.value)
const canPaste = computed(() => adjustmentStore.clipboard !== null)
const showReset = computed(() => canInteract.value && hasAdjustments(adjustmentStore.getFor(activeItem.value!.id)))

watch(
  () => activeItem.value?.id ?? null,
  async (mediaId, previousMediaId) => {
    if (previousMediaId && previousMediaId !== mediaId) {
      await adjustmentStore.flush()
    }

    if (mediaId && activeItem.value?.media_type === 'image') {
      await adjustmentStore.load(mediaId)
    }
  },
  { immediate: true }
)

onBeforeUnmount(() => {
  void adjustmentStore.flush()
})

function setField(key: keyof typeof DEFAULT_IMAGE_ADJUSTMENTS, value: number): void {
  if (!canInteract.value) return
  adjustmentStore.setField(activeItem.value!.id, key, value)
}

function resetField(key: keyof typeof DEFAULT_IMAGE_ADJUSTMENTS): void {
  if (!canInteract.value) return
  setField(key, DEFAULT_IMAGE_ADJUSTMENTS[key])
}

async function resetAll(): Promise<void> {
  if (!canInteract.value) return
  await adjustmentStore.reset(activeItem.value!.id)
}

function copyAdjustments(): void {
  if (!canInteract.value) return
  adjustmentStore.copy(activeItem.value!.id)
}

async function pasteAdjustments(): Promise<void> {
  if (!canInteract.value) return
  await adjustmentStore.paste(activeItem.value!.id)
}
</script>

<template>
  <PaneLayout title="Adjustments">
    <PaneGate v-if="noSelection" message="Select an image to adjust" />
    <PaneGate v-else-if="multipleSelection" message="Select a single image to adjust" />
    <PaneGate v-else-if="notImage" message="Adjustments are available for images only" />
    <PaneGate v-else-if="notLoupe" message="Open an image in loupe view to adjust" />

    <PaneBody v-else>
      <PaneSection title="Light">
        <div class="space-y-3">
          <AdjustmentSlider
            v-for="config in ADJUSTMENT_SLIDER_GROUPS.light"
            :key="config.key"
            :config="config"
            :model-value="currentAdjustments[config.key]"
            :disabled="!canInteract"
            @update:model-value="setField(config.key, $event)"
            @reset="resetField(config.key)"
          />
        </div>
      </PaneSection>

      <PaneSection title="Color">
        <div class="space-y-3">
          <AdjustmentSlider
            v-for="config in ADJUSTMENT_SLIDER_GROUPS.color"
            :key="config.key"
            :config="config"
            :model-value="currentAdjustments[config.key]"
            :disabled="!canInteract"
            @update:model-value="setField(config.key, $event)"
            @reset="resetField(config.key)"
          />
        </div>
      </PaneSection>

      <PaneSection title="Effects">
        <div class="space-y-3">
          <AdjustmentSlider
            v-for="config in ADJUSTMENT_SLIDER_GROUPS.effects"
            :key="config.key"
            :config="config"
            :model-value="currentAdjustments[config.key]"
            :disabled="!canInteract"
            @update:model-value="setField(config.key, $event)"
            @reset="resetField(config.key)"
          />
        </div>
      </PaneSection>

      <PaneSection title="Actions">
        <div class="space-y-2">
          <div class="flex gap-2">
            <Button
              outlined
              severity="secondary"
              size="small"
              class="min-w-0 flex-1 justify-center"
              :disabled="!canInteract"
              @click="copyAdjustments"
            >
              <Icon icon="lucide:copy" class="size-4" />
              Copy
            </Button>
            <Button
              outlined
              severity="secondary"
              size="small"
              class="min-w-0 flex-1 justify-center"
              :disabled="!canInteract || !canPaste"
              @click="pasteAdjustments"
            >
              <Icon icon="lucide:clipboard-paste" class="size-4" />
              Paste
            </Button>
          </div>

          <Button
            outlined
            severity="secondary"
            size="small"
            class="w-full justify-center"
            :disabled="!showReset"
            @click="resetAll"
          >
            <Icon icon="lucide:undo-2" class="size-4" />
            Reset All
          </Button>
        </div>
      </PaneSection>
    </PaneBody>
  </PaneLayout>
</template>