<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'

const isMaximized = ref(false)

const dragStyle = { WebkitAppRegion: 'drag' as const }
const noDragStyle = { WebkitAppRegion: 'no-drag' as const }

function handleMinimize(): void {
  void window.api.windowMinimize()
}

function handleToggleMaximize(): void {
  void window.api.windowToggleMaximize()
}

function handleClose(): void {
  void window.api.windowClose()
}

let unsubscribe: (() => void) | null = null

onMounted(async () => {
  try {
    isMaximized.value = await window.api.windowIsMaximized()
  } catch {
    isMaximized.value = false
  }

  unsubscribe = window.api.on('app:windowMaximizedChanged', (value: unknown) => {
    isMaximized.value = Boolean(value)
  })
})

onBeforeUnmount(() => {
  unsubscribe?.()
  unsubscribe = null
})
</script>

<template>
  <header
    class="flex h-10 shrink-0 items-center border-b px-3"
    :style="dragStyle"
    @dblclick="handleToggleMaximize"
  >
    <div class="flex min-w-0 flex-1 items-center">
      <span class="truncate text-sm font-medium">Distillery</span>
    </div>

    <div class="flex items-stretch gap-1" :style="noDragStyle" @dblclick.stop>
      <UButton color="neutral" variant="ghost" square aria-label="Minimize" @click="handleMinimize">
        <UIcon name="i-lucide-minus" class="size-4" />
      </UButton>

      <UButton
        color="neutral"
        variant="ghost"
        square
        :aria-label="isMaximized ? 'Restore window' : 'Maximize window'"
        @click="handleToggleMaximize"
      >
        <UIcon :name="isMaximized ? 'i-lucide-copy' : 'i-lucide-square'" class="size-4" />
      </UButton>

      <UButton
        color="neutral"
        variant="ghost"
        square
        aria-label="Close"
        class="hover:bg-error hover:text-white"
        @click="handleClose"
      >
        <UIcon name="i-lucide-x" class="size-4" />
      </UButton>
    </div>
  </header>
</template>
