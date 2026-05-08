<script setup lang="ts">
import { computed } from 'vue'
import Button from 'primevue/button'

import PaneSection from '@/components/panes/primitives/PaneSection.vue'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ASPECT_RATIOS = [
  { label: '1:1', w: 1, h: 1 },
  { label: '16:9', w: 16, h: 9 },
  { label: '9:16', w: 9, h: 16 },
  { label: '4:3', w: 4, h: 3 },
  { label: '3:4', w: 3, h: 4 },
  { label: '3:2', w: 3, h: 2 },
  { label: '2:3', w: 2, h: 3 }
]

type AspectRatioPreset = (typeof ASPECT_RATIOS)[number]

const RESOLUTION_PRESETS = [
  { mp: 0.25, baseSize: 512 },
  { mp: 0.5, baseSize: 720 },
  { mp: 1.0, baseSize: 1024 },
  { mp: 1.5, baseSize: 1248 },
  { mp: 2.0, baseSize: 1456 }
]

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function computeDimensions(baseSize: number, aw: number, ah: number) {
  const area = baseSize * baseSize
  const width = Math.round(Math.sqrt((area * aw) / ah) / 16) * 16
  const height = Math.round(Math.sqrt((area * ah) / aw) / 16) * 16
  return { width, height }
}

function fitsConstraints(w: number, h: number, min: number, max: number) {
  return w >= min && w <= max && h >= min && h <= max
}

function inferResolution(w: number, h: number) {
  const area = w * h
  let best = RESOLUTION_PRESETS[2]
  let bestDiff = Infinity
  for (const preset of RESOLUTION_PRESETS) {
    const diff = Math.abs(area - preset.baseSize * preset.baseSize)
    if (diff < bestDiff) {
      bestDiff = diff
      best = preset
    }
  }
  return best
}

function inferAspectRatio(w: number, h: number): AspectRatioPreset {
  const ratio = w / h
  let best = ASPECT_RATIOS[0]
  let bestDiff = Infinity
  for (const ar of ASPECT_RATIOS) {
    const diff = Math.abs(ratio - ar.w / ar.h)
    if (diff < bestDiff) {
      bestDiff = diff
      best = ar
    }
  }
  return best
}

function formatMP(mp: number): string {
  return mp % 1 === 0 ? mp.toFixed(0) : mp.toFixed(1)
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

const props = withDefaults(
  defineProps<{
    modelValue: string
    disabled?: boolean
    min?: number
    max?: number
    showComputed?: boolean
  }>(),
  { disabled: false, min: 256, max: 2048, showComputed: false }
)

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

// ---------------------------------------------------------------------------
// Computed
// ---------------------------------------------------------------------------

const parsed = computed(() => {
  const parts = (props.modelValue || '1024*1024').split('*')
  return { w: parseInt(parts[0], 10) || 1024, h: parseInt(parts[1], 10) || 1024 }
})

const resolution = computed(() => inferResolution(parsed.value.w, parsed.value.h))
const aspect = computed(() => inferAspectRatio(parsed.value.w, parsed.value.h))

const availableResolutions = computed(() =>
  RESOLUTION_PRESETS.filter((preset) => {
    const { width, height } = computeDimensions(preset.baseSize, aspect.value.w, aspect.value.h)
    return fitsConstraints(width, height, props.min, props.max)
  })
)

const computedDims = computed(() =>
  computeDimensions(resolution.value.baseSize, aspect.value.w, aspect.value.h)
)

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

function handleResolution(preset: (typeof RESOLUTION_PRESETS)[number]) {
  const { width, height } = computeDimensions(preset.baseSize, aspect.value.w, aspect.value.h)
  emit('update:modelValue', `${width}*${height}`)
}

function handleAspect(ar: AspectRatioPreset) {
  const { width, height } = computeDimensions(resolution.value.baseSize, ar.w, ar.h)
  emit('update:modelValue', `${width}*${height}`)
}
</script>

<template>
  <div class="space-y-3">
    <!-- Resolution presets -->
    <div>
      <PaneSection title="Resolution">
        <div class="grid grid-cols-5 gap-1">
          <Button
            v-for="preset in availableResolutions"
            :key="preset.mp"
            size="small"
            :outlined="resolution.mp !== preset.mp"
            :severity="resolution.mp === preset.mp ? undefined : 'secondary'"
            :disabled="disabled"
            class="w-full whitespace-nowrap px-0"
            @click="handleResolution(preset)"
          >
            {{ formatMP(preset.mp) }}
          </Button>
        </div>
      </PaneSection>
    </div>

    <!-- Aspect ratio presets -->
    <div>
      <PaneSection title="Aspect Ratio">
        <div class="grid grid-cols-5 gap-1">
          <Button
            v-for="ar in ASPECT_RATIOS"
            :key="ar.label"
            size="small"
            :outlined="!(aspect.w === ar.w && aspect.h === ar.h)"
            :severity="aspect.w === ar.w && aspect.h === ar.h ? undefined : 'secondary'"
            :disabled="disabled"
            class="w-full px-0"
            @click="handleAspect(ar)"
          >
            {{ ar.label }}
          </Button>
        </div>
      </PaneSection>
    </div>

    <div v-if="showComputed" class="text-xs text-muted">
      {{ computedDims.width }} × {{ computedDims.height }} px
    </div>
  </div>
</template>
