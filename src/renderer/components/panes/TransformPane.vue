<script setup lang="ts">
import { computed, watch } from 'vue'
import { Icon } from '@iconify/vue'
import Button from 'primevue/button'

import PaneActions from '@/components/panes/primitives/PaneActions.vue'
import PaneBody from '@/components/panes/primitives/PaneBody.vue'
import PaneField from '@/components/panes/primitives/PaneField.vue'
import PaneGate from '@/components/panes/primitives/PaneGate.vue'
import PaneLayout from '@/components/panes/primitives/PaneLayout.vue'
import PaneSection from '@/components/panes/primitives/PaneSection.vue'
import AspectIcon from '@/components/shared/AspectIcon.vue'
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
    <PaneGate v-if="noSelection" message="Select an image to transform" />
    <PaneGate v-else-if="notImage" message="Transforms are available for images only" />
    <PaneGate v-else-if="notLoupe" message="Open an image in the loupe view to access transforms" />

    <PaneBody v-else>
      <!-- Rotate & Flip -->
      <PaneSection title="Rotate & Flip">
        <div class="flex flex-wrap gap-2">
          <Button
            outlined
            severity="secondary"
            :disabled="isCropTarget"
            aria-label="Rotate counterclockwise"
            @click="transformStore.rotate(focusedItem!.id, 'ccw')"
          >
            <Icon icon="lucide:rotate-ccw" class="size-4" />
          </Button>
          <Button
            outlined
            severity="secondary"
            :disabled="isCropTarget"
            aria-label="Rotate clockwise"
            @click="transformStore.rotate(focusedItem!.id, 'cw')"
          >
            <Icon icon="lucide:rotate-cw" class="size-4" />
          </Button>
          <Button
            outlined
            severity="secondary"
            :disabled="isCropTarget"
            aria-label="Flip horizontally"
            @click="transformStore.flipH(focusedItem!.id)"
          >
            <Icon icon="lucide:flip-horizontal-2" class="size-4" />
          </Button>
          <Button
            outlined
            severity="secondary"
            :disabled="isCropTarget"
            aria-label="Flip vertically"
            @click="transformStore.flipV(focusedItem!.id)"
          >
            <Icon icon="lucide:flip-vertical-2" class="size-4" />
          </Button>
        </div>
      </PaneSection>

      <!-- Crop -->
      <PaneSection title="Crop">
        <div class="space-y-3">
          <PaneField label="Aspect Ratio">
            <div class="grid grid-cols-4 gap-1">
              <Button
                v-for="option in ASPECT_RATIO_OPTIONS"
                :key="option.value"
                size="small"
                :outlined="(transformStore.cropAspectRatio ?? 'free') !== option.value"
                :severity="(transformStore.cropAspectRatio ?? 'free') === option.value ? undefined : 'secondary'"
                :disabled="!isCropTarget"
                class="justify-center"
                @click="transformStore.setCropAspectRatio(option.value)"
              >
                <AspectIcon v-if="option.value !== 'free'" :ratio="option.value" />
                {{ option.label }}
              </Button>
            </div>
          </PaneField>

          <PaneField label="Guides">
            <div class="grid grid-cols-3 gap-1">
              <Button
                v-for="option in GUIDE_OPTIONS"
                :key="option.value"
                size="small"
                :outlined="transformStore.cropGuide !== option.value"
                :severity="transformStore.cropGuide === option.value ? undefined : 'secondary'"
                class="justify-center"
                @click="transformStore.setCropGuide(option.value)"
              >
                {{ option.label }}
              </Button>
            </div>
          </PaneField>

          <PaneActions v-if="!isCropTarget" stack>
            <Button
              outlined
              severity="secondary"
              @click="transformStore.enterCropMode()"
            >
              <Icon icon="lucide:crop" class="size-4" />
              Crop
            </Button>
          </PaneActions>
          <PaneActions v-else>
            <Button
              @click="transformStore.applyCrop()"
            >
              <Icon icon="lucide:check" class="size-4" />
              Apply
            </Button>
            <Button
              outlined
              severity="secondary"
              @click="transformStore.cancelCrop()"
            >
              <Icon icon="lucide:x" class="size-4" />
              Cancel
            </Button>
          </PaneActions>
        </div>
      </PaneSection>

      <!-- Reset -->
      <PaneSection v-if="hasTransforms" title="Reset">
        <PaneActions stack>
          <Button
            outlined
            severity="secondary"
            @click="transformStore.resetAll(focusedItem!.id)"
          >
            <Icon icon="lucide:undo-2" class="size-4" />
            Reset All
          </Button>
        </PaneActions>
      </PaneSection>
    </PaneBody>
  </PaneLayout>
</template>
