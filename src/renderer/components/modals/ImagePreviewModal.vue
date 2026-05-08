<script setup lang="ts">
defineProps<{
  open: boolean
  src: string | null
  alt?: string
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
}>()

function close(): void {
  emit('update:open', false)
}

function onKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape') close()
}
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <button
        v-if="open"
        type="button"
        class="fixed inset-0 z-50 flex cursor-pointer items-center justify-center border-0 bg-black/80 p-4"
        aria-label="Close preview"
        @click="close"
        @keydown="onKeydown"
      >
        <img
          v-if="src"
          :src="src"
          :alt="alt ?? 'Image preview'"
          draggable="false"
          class="max-h-[92dvh] max-w-[92vw] rounded object-contain"
        />
      </button>
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
