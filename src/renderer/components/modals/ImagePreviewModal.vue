<script setup lang="ts">
import { ref, watch } from 'vue'
import { Icon } from '@iconify/vue'

const props = defineProps<{
  open: boolean
  src: string | null
  alt?: string
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
}>()

const zoomed = ref(false)

// Reset zoom when modal closes
watch(
  () => props.open,
  (isOpen) => {
    if (!isOpen) zoomed.value = false
  }
)

function close(): void {
  emit('update:open', false)
}

function toggleZoom(): void {
  zoomed.value = !zoomed.value
}

function onKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape') close()
}
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div
        v-if="open"
        class="fixed inset-0 z-50 flex flex-col"
        :class="zoomed ? 'bg-black/95' : 'bg-black/80'"
        @keydown="onKeydown"
      >
        <!-- Backdrop click to close -->
        <div class="absolute inset-0" @click="close" />

        <!-- Toolbar -->
        <div class="relative z-10 flex shrink-0 items-center justify-end gap-1 px-3 py-2">
          <button
            type="button"
            class="rounded p-1.5 text-white/70 transition-colors hover:bg-white/10 hover:text-white"
            aria-label="Close preview"
            @click="close"
          >
            <Icon icon="lucide:x" class="size-4" />
          </button>
        </div>

        <!-- Image area -->
        <div
          class="relative z-10 flex min-h-0 flex-1 items-center justify-center px-4 pb-4"
          :class="zoomed ? 'cursor-zoom-out overflow-auto' : 'cursor-zoom-in'"
          @click.self="toggleZoom"
        >
          <img
            v-if="src"
            :src="src"
            :alt="alt ?? 'Image preview'"
            draggable="false"
            :class="
              zoomed
                ? 'max-h-none max-w-none'
                : 'max-h-[calc(92dvh-3rem)] max-w-[92vw] object-contain'
            "
            class="rounded"
            @click="toggleZoom"
          />
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.15s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
