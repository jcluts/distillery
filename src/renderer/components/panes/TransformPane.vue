<script setup lang="ts">
import { computed, watch } from 'vue'

import PaneLayout from '@/components/panes/PaneLayout.vue'
import PaneSection from '@/components/panes/PaneSection.vue'
import AspectIcon from '@/components/panes/transform/AspectIcon.vue'
import { isDefaultTransforms } from '@/lib/transform-math'
import { useLibraryStore } from '@/stores/library'
import { useUIStore } from '@/stores/ui'
import { useTransformStore } from '@/stores/transform'

const libraryStore = useLibraryStore()
const uiStore = useUIStore()
const transformStore = useTransformStore()

const focusedItem = computed(() => {
  if (!libraryStore.focusedId) return null
  return libraryStore.items.find((item) => item.id === libraryStore.focusedId) ?? null
})

const transforms = computed(() =>
  focusedItem.value ? transformStore.getTransformsFor(focusedItem.value.id) : null
)

const isCropTarget = computed(
  () => transformStore.cropMode && transformStore.cropMediaId === focusedItem.value?.id
)

const hasTransforms = computed(() => !isDefaultTransforms(transforms.value))

// Load transforms when focused image changes
watch(
  () => focusedItem.value,
  (item) => {
    if (item?.media_type === 'image') {
      void transformStore.loadTransforms(item.id)
    }
  },
  { immediate: true }
)

// Gate conditions
const noSelection = computed(() => !focusedItem.value)
const notImage = computed(
  () => focusedItem.value && focusedItem.value.media_type !== 'image'
)
const notLoupe = computed(() => uiStore.viewMode !== 'loupe')

const ASPECT_RATIO_OPTIONS = [
  { value: 'free', label: 'Free' },
  { value: '1:1', label: '1:1' },
  { value: '5:4', label: '5:4' },
  { value: '4:5', label: '4:5' },
  { value: '4:3', label: '4:3' },
  { value: '3:4', label: '3:4' },
  { value: '3:2', label: '3:2' },
  { value: '2:3', label: '2:3' },
  { value: '16:9', label: '16:9' },
  { value: '9:16', label: '9:16' },
  { value: '21:9', label: '21:9' },
  { value: '9:21', label: '9:21' }
]

const GUIDE_OPTIONS: { value: 'thirds' | 'grid' | 'golden'; label: string }[] = [
  { value: 'thirds', label: 'Thirds' },
  { value: 'grid', label: 'Grid' },
  { value: 'golden', label: 'Golden' }
]
</script>

<template>
  <PaneLayout title="Transform">
    <!-- Gate: no selection -->
    <div
      v-if="noSelection"
      class="flex items-center justify-center px-4 py-8 text-sm text-muted"
    >
      Select an image to transform
    </div>

    <!-- Gate: not an image -->
    <div
      v-else-if="notImage"
      class="flex items-center justify-center px-4 py-8 text-sm text-muted"
    >
      Transforms are available for images only
    </div>

    <!-- Gate: not in loupe view -->
    <div
      v-else-if="notLoupe"
      class="flex items-center justify-center px-4 py-8 text-sm text-muted"
    >
      Open an image in the loupe view to access transforms
    </div>

    <!-- Main content -->
    <div v-else class="space-y-4">
      <!-- Rotate & Flip -->
      <PaneSection title="Rotate & Flip">
        <div class="flex flex-wrap gap-2">
          <UButton
            icon="i-lucide-rotate-ccw"
            color="neutral"
            variant="outline"
            square
            :disabled="isCropTarget"
            aria-label="Rotate counterclockwise"
            @click="transformStore.rotate(focusedItem!.id, 'ccw')"
          />
          <UButton
            icon="i-lucide-rotate-cw"
            color="neutral"
            variant="outline"
            square
            :disabled="isCropTarget"
            aria-label="Rotate clockwise"
            @click="transformStore.rotate(focusedItem!.id, 'cw')"
          />
          <UButton
            icon="i-lucide-flip-horizontal-2"
            color="neutral"
            variant="outline"
            square
            :disabled="isCropTarget"
            aria-label="Flip horizontally"
            @click="transformStore.flipH(focusedItem!.id)"
          />
          <UButton
            icon="i-lucide-flip-vertical-2"
            color="neutral"
            variant="outline"
            square
            :disabled="isCropTarget"
            aria-label="Flip vertically"
            @click="transformStore.flipV(focusedItem!.id)"
          />
        </div>
      </PaneSection>

      <!-- Crop section -->
      <div class="space-y-3">
        <!-- Aspect Ratio -->
        <PaneSection title="Aspect Ratio">
          <div class="grid grid-cols-4 gap-1">
            <UButton
              v-for="option in ASPECT_RATIO_OPTIONS"
              :key="option.value"
              size="xs"
              :variant="(transformStore.cropAspectRatio ?? 'free') === option.value ? 'soft' : 'outline'"
              :color="(transformStore.cropAspectRatio ?? 'free') === option.value ? 'primary' : 'neutral'"
              :disabled="!isCropTarget"
              class="justify-center"
              @click="transformStore.setCropAspectRatio(option.value)"
            >
              <AspectIcon v-if="option.value !== 'free'" :ratio="option.value" />
              {{ option.label }}
            </UButton>
          </div>
        </PaneSection>

        <!-- Guides -->
        <PaneSection title="Guides">
          <div class="grid grid-cols-3 gap-1">
            <UButton
              v-for="option in GUIDE_OPTIONS"
              :key="option.value"
              size="xs"
              :variant="transformStore.cropGuide === option.value ? 'soft' : 'outline'"
              :color="transformStore.cropGuide === option.value ? 'primary' : 'neutral'"
              class="justify-center"
              @click="transformStore.setCropGuide(option.value)"
            >
              {{ option.label }}
            </UButton>
          </div>
        </PaneSection>

        <!-- Crop / Apply+Cancel buttons -->
        <div>
          <div v-if="!isCropTarget">
            <UButton
              icon="i-lucide-crop"
              color="neutral"
              variant="outline"
              class="w-full justify-center"
              @click="transformStore.enterCropMode()"
            >
              Crop
            </UButton>
          </div>
          <div v-else class="flex gap-2">
            <UButton
              icon="i-lucide-check"
              color="primary"
              class="flex-1 justify-center"
              @click="transformStore.applyCrop()"
            >
              Apply
            </UButton>
            <UButton
              icon="i-lucide-x"
              color="neutral"
              variant="outline"
              class="flex-1 justify-center"
              @click="transformStore.cancelCrop()"
            >
              Cancel
            </UButton>
          </div>
        </div>
      </div>

      <!-- Reset -->
      <PaneSection v-if="hasTransforms" title="Reset">
        <UButton
          icon="i-lucide-undo-2"
          color="neutral"
          variant="outline"
          class="w-full justify-center"
          @click="transformStore.resetAll(focusedItem!.id)"
        >
          Reset All
        </UButton>
      </PaneSection>
    </div>
  </PaneLayout>
</template>
