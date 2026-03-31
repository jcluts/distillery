<script setup lang="ts">
import { Icon } from '@iconify/vue'
import Button from 'primevue/button'

export interface SidebarTab {
  id: string
  icon: string
  label: string
  badge?: number
}

defineProps<{
  tabs: SidebarTab[]
  activeTab: string
  active: boolean
}>()

defineEmits<{
  select: [id: string]
}>()
</script>

<template>
  <div class="flex w-12 shrink-0 flex-col items-center gap-1 pt-2 bg-surface-900">
    <div v-for="tab in tabs" :key="tab.id" class="relative">
      <Button
        text
        plain
        :severity="active && activeTab === tab.id ? undefined : 'secondary'"
        size="small"
        :aria-label="tab.label"
        @click="$emit('select', tab.id)"
      >
        <Icon
          :icon="tab.icon"
          class="size-5"
          :style="active && activeTab === tab.id ? { color: 'var(--p-primary-color)' } : undefined"
        />
      </Button>
      <span
        v-if="tab.badge && tab.badge > 0"
        class="pointer-events-none absolute -top-0.5 -right-0.5 z-10 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold leading-none text-primary-contrast"
      >
        {{ tab.badge > 99 ? '99+' : tab.badge }}
      </span>
    </div>
  </div>
</template>
