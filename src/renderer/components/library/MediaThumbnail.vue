<script setup lang="ts">
import { computed } from 'vue'
import { Icon } from '@iconify/vue'

import { formatDuration } from '@/lib/media'
import type { MediaRecord } from '@/types'

type OverlaySize = 'grid' | 'filmstrip'

const overlayClassBySize: Record<
  OverlaySize,
  {
    statusPosition: string
    statusBadgeSize: string
    statusIconSize: string
    ratingPosition: string
    ratingStarSize: string
  }
> = {
  grid: {
    statusPosition: 'top-1.5 left-1.5',
    statusBadgeSize: 'h-5 w-5',
    statusIconSize: 'size-3',
    ratingPosition: 'top-1.5 right-1.5',
    ratingStarSize: 'size-3'
  },
  filmstrip: {
    statusPosition: 'top-1 left-1',
    statusBadgeSize: 'h-4 w-4',
    statusIconSize: 'size-2.5',
    ratingPosition: 'top-1 right-1',
    ratingStarSize: 'size-2.5'
  }
}

const props = defineProps<{
  media: MediaRecord
  index: number
  selected: boolean
  focused: boolean
  overlaySize?: OverlaySize
}>()

defineEmits<{
  click: [event: MouseEvent]
  dblclick: []
}>()

const starCount = computed(() => Math.max(0, Math.min(5, Math.floor(props.media.rating))))
const isVideo = computed(() => props.media.media_type === 'video')
const overlayClasses = computed(() => overlayClassBySize[props.overlaySize ?? 'grid'])

const ringClass = computed(() => {
  if (props.focused) return 'ring-2 ring-primary'
  if (props.selected) return 'ring-2'
  return ''
})
</script>

<template>
  <button
    type="button"
    class="group relative aspect-square rounded-lg outline-none"
    :class="ringClass"
    @click="$emit('click', $event)"
    @dblclick="$emit('dblclick')"
  >
    <div class="relative h-full w-full overflow-hidden rounded-lg bg-surface-800">
      <img
        v-if="media.thumb_path"
        :src="media.thumb_path"
        :alt="media.file_name"
        class="absolute inset-0 h-full w-full object-cover"
        loading="lazy"
        draggable="false"
      />

      <div v-else class="absolute inset-0 flex items-center justify-center text-xs text-muted-color">
        {{ index + 1 }}
      </div>

      <div
        v-if="media.status"
        class="absolute flex items-center justify-center rounded-full shadow-sm bg-primary text-primary-contrast"
        :class="[overlayClasses.statusPosition, overlayClasses.statusBadgeSize]"
      >
        <Icon
          :icon="media.status === 'selected' ? 'lucide:check' : 'lucide:x'"
          :class="overlayClasses.statusIconSize"
        />
      </div>

      <div
        v-if="starCount > 0"
        class="absolute flex items-center gap-px drop-shadow-sm"
        :class="overlayClasses.ratingPosition"
      >
        <Icon
          v-for="starIndex in starCount"
          :key="starIndex"
          icon="lucide:star"
          class="fill-primary text-primary"
          :class="overlayClasses.ratingStarSize"
        />
      </div>

      <template v-if="isVideo">
        <div class="absolute bottom-1.5 left-1.5 rounded-full bg-black/65 p-1 text-white shadow-sm">
          <Icon icon="lucide:play" class="size-3" />
        </div>

        <div
          v-if="media.duration !== null"
          class="absolute right-1.5 bottom-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-white shadow-sm"
        >
          {{ formatDuration(media.duration) }}
        </div>
      </template>
    </div>
  </button>
</template>
