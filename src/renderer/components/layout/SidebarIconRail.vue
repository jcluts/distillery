<script setup lang="ts">
import { Icon } from '@iconify/vue'
import Button from 'primevue/button'

export interface SidebarTab {
  id: string
  icon: string
  label: string
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
    <Button
      v-for="tab in tabs"
      :key="tab.id"
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
  </div>
</template>
