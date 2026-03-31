<script setup lang="ts">
import { computed, watch } from 'vue'
import { Icon } from '@iconify/vue'
import Button from 'primevue/button'
import Select from 'primevue/select'

import PaneBody from '@/components/panes/primitives/PaneBody.vue'
import PaneGate from '@/components/panes/primitives/PaneGate.vue'
import PaneLayout from '@/components/panes/primitives/PaneLayout.vue'
import PaneSection from '@/components/panes/primitives/PaneSection.vue'
import UpscaleStatus from '@/components/upscale/UpscaleStatus.vue'
import ListItem from '@/components/panes/primitives/ListItem.vue'
import { useLibraryStore } from '@/stores/library'
import { useUpscaleStore } from '@/stores/upscale'
import type { UpscaleVariant } from '@/types'

const libraryStore = useLibraryStore()
const upscaleStore = useUpscaleStore()

const focusedItem = computed(() => {
  if (!libraryStore.focusedId) return null
  return libraryStore.items.find((item) => item.id === libraryStore.focusedId) ?? null
})

const selectedModel = computed(() =>
  upscaleStore.models.find((m) => m.id === upscaleStore.selectedModelId) ?? null
)

const supportedScales = computed(() => selectedModel.value?.supportedScales ?? [2, 3, 4])

// Load models on mount
void upscaleStore.loadModels()

// Load upscale data when focused item changes
watch(
  () => focusedItem.value?.id,
  (id) => {
    if (id) void upscaleStore.loadUpscaleData(id)
  },
  { immediate: true }
)

// Ensure selectedScale is valid for current model
watch(
  () => selectedModel.value,
  (model) => {
    if (model && !model.supportedScales.includes(upscaleStore.selectedScale)) {
      upscaleStore.setSelectedScale(model.supportedScales[model.supportedScales.length - 1])
    }
  }
)

function formatDimensions(w: number, h: number): string {
  return `${w} × ${h}`
}

function formatFileSize(bytes: number | null): string {
  if (bytes === null) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function variantDescription(v: UpscaleVariant): string {
  let desc = formatDimensions(v.width, v.height)
  if (v.file_size) desc += ` · ${formatFileSize(v.file_size)}`
  desc += ` · ${formatDate(v.created_at)}`
  return desc
}
</script>

<template>
  <PaneLayout title="Upscale">
    <PaneGate v-if="!focusedItem" message="Select an image to upscale" />

    <PaneBody v-else>
      <!-- Model selector -->
      <PaneSection title="Model">
        <Select
          :model-value="upscaleStore.selectedModelId"
          :options="upscaleStore.models"
          option-label="name"
          option-value="id"
          placeholder="Select model"
          class="w-full"
          @update:model-value="(v: string) => upscaleStore.setSelectedModelId(v)"
        >
          <template #option="{ option }">
            <div>
              <div>{{ option.name }}</div>
              <div class="text-xs text-muted">{{ option.description }}</div>
            </div>
          </template>
        </Select>
      </PaneSection>

      <!-- Scale factor -->
      <PaneSection title="Scale Factor">
        <div class="flex gap-1">
          <Button
            v-for="s in supportedScales"
            :key="s"
            size="small"
            :outlined="upscaleStore.selectedScale !== s"
            :severity="upscaleStore.selectedScale === s ? undefined : 'secondary'"
            @click="upscaleStore.setSelectedScale(s)"
          >
            {{ s }}×
          </Button>
        </div>
      </PaneSection>

      <!-- Upscale button + status -->
      <PaneSection title="Actions">
        <div class="space-y-3">
          <Button
            class="w-full"
            :disabled="!upscaleStore.selectedModelId || upscaleStore.isUpscaling"
            @click="() => { if (focusedItem) void upscaleStore.submit(focusedItem.id) }"
          >
            <Icon
              v-if="upscaleStore.isUpscaling"
              icon="lucide:loader-2"
              class="size-4 animate-spin mr-2"
            />
            {{ upscaleStore.isUpscaling ? 'Upscaling…' : 'Upscale' }}
          </Button>

          <UpscaleStatus />
        </div>
      </PaneSection>

      <!-- Variants list -->
      <PaneSection
        v-if="upscaleStore.variants.length > 0 || upscaleStore.activeVariantId !== null"
        title="Variants"
      >
        <div class="space-y-1.5">
          <!-- Original entry -->
          <ListItem
            selectable
            :selected="upscaleStore.activeVariantId === null"
            @select="() => { if (focusedItem) void upscaleStore.setActive(focusedItem.id, null) }"
          >
            <template #icon>
              <Icon
                v-if="upscaleStore.activeVariantId === null"
                icon="lucide:check"
                class="size-4 text-primary"
              />
              <span v-else class="size-4" />
            </template>
            <span class="font-medium">Original</span>
            <template #badge>
              <span
                v-if="focusedItem.width && focusedItem.height"
                class="text-xs text-muted"
              >
                {{ formatDimensions(focusedItem.width, focusedItem.height) }}
              </span>
            </template>
          </ListItem>

          <!-- Variant entries -->
          <ListItem
            v-for="v in upscaleStore.variants"
            :key="v.id"
            selectable
            :selected="v.id === upscaleStore.activeVariantId"
            @select="() => { if (focusedItem) void upscaleStore.setActive(focusedItem.id, v.id) }"
          >
            <template #icon>
              <Icon
                v-if="v.id === upscaleStore.activeVariantId"
                icon="lucide:check"
                class="size-4 text-primary"
              />
              <span v-else class="size-4" />
            </template>
            <div>
              <div class="flex items-center gap-1.5">
                <span class="font-medium">{{ v.model_name }}</span>
                <span class="text-muted">{{ v.scale_factor }}×</span>
              </div>
              <div class="truncate text-xs text-muted">
                {{ variantDescription(v) }}
              </div>
            </div>
            <template #actions>
              <Button
                v-tooltip.left="'Delete variant'"
                text
                plain
                severity="secondary"
                size="small"
                class="hover:!text-red-400"
                @click.stop="() => { if (focusedItem) void upscaleStore.deleteVariant(v.id, focusedItem.id) }"
              >
                <Icon icon="lucide:trash-2" class="size-3.5" />
              </Button>
            </template>
          </ListItem>
        </div>
      </PaneSection>
    </PaneBody>
  </PaneLayout>
</template>
