<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'
import { Icon } from '@iconify/vue'
import Button from 'primevue/button'

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
    class="flex h-10 shrink-0 items-center px-3"
    style="background: var(--p-surface-900)"
    :style="dragStyle"
    @dblclick="handleToggleMaximize"
  >
    <div class="min-w-0 flex-1">
      <span class="text-sm font-medium">Distillery</span>
    </div>

    <div class="flex items-center" :style="noDragStyle" @dblclick.stop>
      <Button
        text
        plain
        severity="secondary"
        size="small"
        aria-label="Minimize"
        @click="handleMinimize"
      >
        <Icon icon="lucide:minus" class="size-4" />
      </Button>

      <Button
        text
        plain
        severity="secondary"
        size="small"
        :aria-label="isMaximized ? 'Restore window' : 'Maximize window'"
        @click="handleToggleMaximize"
      >
        <Icon :icon="isMaximized ? 'lucide:copy' : 'lucide:square'" class="size-4" />
      </Button>

      <Button
        text
        plain
        severity="secondary"
        size="small"
        aria-label="Close"
        class="hover:!bg-red-600 hover:!text-white"
        @click="handleClose"
      >
        <Icon icon="lucide:x" class="size-4" />
      </Button>
    </div>
  </header>
</template>
