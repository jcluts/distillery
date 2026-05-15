<script setup lang="ts">
import { useVirtualizer } from '@tanstack/vue-virtual'
import { computed, nextTick, ref, watch } from 'vue'
import { Icon } from '@iconify/vue'
import Button from 'primevue/button'

import MediaThumbnail from '@/components/library/MediaThumbnail.vue'
import { useFilmstripSelection } from '@/composables/useFilmstripSelection'
import {
  FILMSTRIP_GAP,
  FILMSTRIP_HEIGHT,
  FILMSTRIP_ITEM_SIZE,
  FILMSTRIP_OVERSCAN
} from '@/lib/constants'
import { useLibraryStore } from '@/stores/library'
import type { MediaRecord } from '@/types'

const props = defineProps<{
  items: MediaRecord[]
  currentIndex: number
}>()

const emit = defineEmits<{
  select: [id: string]
}>()

const libraryStore = useLibraryStore()
const { handleClick, handleDragStart } = useFilmstripSelection()

const scrollRef = ref<HTMLDivElement | null>(null)
const isInitialScroll = ref(true)

const virtualizer = useVirtualizer(
  computed(() => ({
    count: props.items.length,
    getScrollElement: () => scrollRef.value,
    estimateSize: () => FILMSTRIP_ITEM_SIZE + FILMSTRIP_GAP,
    horizontal: true,
    overscan: FILMSTRIP_OVERSCAN
  }))
)

const virtualItems = computed(() => virtualizer.value.getVirtualItems())
const totalSize = computed(() => virtualizer.value.getTotalSize())

watch(
  () => props.items.length,
  () => {
    virtualizer.value.measure()
  }
)

watch([virtualItems, () => props.items.length], ([items, itemCount]) => {
  const lastItem = items[items.length - 1]
  if (!lastItem || itemCount === 0) return

  if (lastItem.index >= itemCount - FILMSTRIP_OVERSCAN) {
    void libraryStore.loadNextPage()
  }
})

watch(
  [() => props.currentIndex, () => props.items.length],
  async ([currentIndex, itemCount]) => {
    if (currentIndex < 0 || currentIndex >= itemCount) return

    await nextTick()
    virtualizer.value.scrollToIndex(currentIndex, {
      align: isInitialScroll.value ? 'center' : 'auto'
    })
    isInitialScroll.value = false
  },
  { immediate: true }
)

async function selectRelative(offset: -1 | 1): Promise<void> {
  const targetIndex = props.currentIndex + offset
  if (targetIndex >= props.items.length) {
    await libraryStore.ensureIndexLoaded(targetIndex)
    await nextTick()
  }

  const nextItem = props.items[targetIndex]
  if (nextItem) {
    emit('select', nextItem.id)
  }
}
</script>

<template>
  <div class="flex shrink-0 items-center gap-2 px-2" :style="{ height: `${FILMSTRIP_HEIGHT}px` }">
    <Button
      text
      plain
      severity="secondary"
      size="small"
      class="h-9 w-9 shrink-0"
      :disabled="currentIndex <= 0"
      aria-label="Previous"
      @click="void selectRelative(-1)"
    >
      <Icon icon="lucide:chevron-left" class="size-4" />
    </Button>

    <div ref="scrollRef" class="h-full w-full overflow-x-auto overflow-y-hidden px-3">
      <div
        class="relative flex h-full items-center"
        :style="{
          width: `${totalSize}px`,
          minHeight: '100%'
        }"
      >
        <div
          v-for="virtualItem in virtualItems"
          :key="props.items[virtualItem.index]?.id"
          class="absolute top-1/2 -translate-y-1/2"
          :style="{
            left: `${virtualItem.start}px`,
            width: `${FILMSTRIP_ITEM_SIZE}px`,
            height: `${FILMSTRIP_ITEM_SIZE}px`
          }"
        >
          <MediaThumbnail
            :media="props.items[virtualItem.index]!"
            :index="virtualItem.index"
            :selected="libraryStore.selectedIds.has(props.items[virtualItem.index]!.id)"
            :focused="props.items[virtualItem.index]!.id === libraryStore.focusedId"
            overlay-size="filmstrip"
            class="size-[86px]"
            draggable="true"
            @click="(event: MouseEvent) => handleClick(event, props.items[virtualItem.index]!.id)"
            @dragstart="
              (event: DragEvent) => handleDragStart(event, props.items[virtualItem.index]!.id)
            "
          />
        </div>
      </div>
    </div>

    <Button
      text
      plain
      severity="secondary"
      size="small"
      class="h-9 w-9 shrink-0"
      :disabled="currentIndex < 0 || (currentIndex >= items.length - 1 && !libraryStore.hasMore)"
      aria-label="Next"
      @click="void selectRelative(1)"
    >
      <Icon icon="lucide:chevron-right" class="size-4" />
    </Button>
  </div>
</template>
