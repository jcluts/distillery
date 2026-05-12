<script setup lang="ts">
import { computed } from 'vue'
import Button from 'primevue/button'

import PaneSection from '@/components/panes/primitives/PaneSection.vue'

const DEFAULT_ASPECT_RATIOS = ['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3']
const DEFAULT_MEGAPIXELS = ['0.25', '0.5', '1', '1.5', '2']

const props = defineProps<{
  aspectRatio: unknown
  megapixels: unknown
  aspectOptions?: Array<string | number>
  megapixelOptions?: Array<string | number>
  disabled?: boolean
}>()

const emit = defineEmits<{
  'update:aspectRatio': [value: string]
  'update:megapixels': [value: string]
}>()

const aspectOptions = computed(() =>
  normalizeOptions(props.aspectOptions, DEFAULT_ASPECT_RATIOS, (value) =>
    value === 'match_input_image' ? 'Match input' : value
  )
)

const megapixelOptions = computed(() =>
  normalizeOptions(props.megapixelOptions, DEFAULT_MEGAPIXELS, formatMegapixels)
)

const currentAspectRatio = computed(
  () => normalizeValue(props.aspectRatio) || aspectOptions.value[0]?.value || '1:1'
)
const currentMegapixels = computed(
  () => normalizeValue(props.megapixels) || megapixelOptions.value[0]?.value || '1'
)

function normalizeOptions(
  source: Array<string | number> | undefined,
  fallback: string[],
  formatLabel: (value: string) => string
): Array<{ label: string; value: string }> {
  const values = (source?.length ? source : fallback).map((value) => String(value))
  return values.map((value) => ({
    value,
    label: formatLabel(value)
  }))
}

function normalizeValue(value: unknown): string {
  if (value === undefined || value === null) return ''
  return String(value)
}

function formatMegapixels(value: string): string {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return value
  return parsed % 1 === 0 ? `${parsed.toFixed(0)} MP` : `${parsed} MP`
}
</script>

<template>
  <div class="space-y-3">
    <PaneSection title="Resolution">
      <div class="grid grid-cols-5 gap-1">
        <Button
          v-for="option in megapixelOptions"
          :key="option.value"
          size="small"
          :outlined="currentMegapixels !== option.value"
          :severity="currentMegapixels === option.value ? undefined : 'secondary'"
          :disabled="disabled"
          class="w-full whitespace-nowrap px-0"
          @click="emit('update:megapixels', option.value)"
        >
          {{ option.label }}
        </Button>
      </div>
    </PaneSection>

    <PaneSection title="Aspect Ratio">
      <div class="grid grid-cols-5 gap-1">
        <Button
          v-for="option in aspectOptions"
          :key="option.value"
          size="small"
          :outlined="currentAspectRatio !== option.value"
          :severity="currentAspectRatio === option.value ? undefined : 'secondary'"
          :disabled="disabled"
          class="w-full px-0"
          @click="emit('update:aspectRatio', option.value)"
        >
          {{ option.label }}
        </Button>
      </div>
    </PaneSection>
  </div>
</template>
