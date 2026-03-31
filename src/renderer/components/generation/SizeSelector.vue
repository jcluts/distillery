<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import Button from 'primevue/button'
import InputNumber from 'primevue/inputnumber'

// ---------------------------------------------------------------------------
// Presets
// ---------------------------------------------------------------------------

const PRESETS_1K = [
  { label: '1:1', width: 1024, height: 1024 },
  { label: '16:9', width: 1280, height: 720 },
  { label: '9:16', width: 720, height: 1280 },
  { label: '4:3', width: 1152, height: 864 },
  { label: '3:4', width: 864, height: 1152 },
  { label: '3:2', width: 1216, height: 832 },
  { label: '2:3', width: 832, height: 1216 }
]
const PRESETS_2K = [
  { label: '1:1', width: 2048, height: 2048 },
  { label: '16:9', width: 2560, height: 1440 },
  { label: '9:16', width: 1440, height: 2560 },
  { label: '4:3', width: 2304, height: 1728 },
  { label: '3:4', width: 1728, height: 2304 },
  { label: '3:2', width: 2432, height: 1664 },
  { label: '2:3', width: 1664, height: 2432 }
]

function generatePresets(min: number, max: number) {
  const presets: { label: string; width: number; height: number }[] = []
  for (let i = 0; i < PRESETS_1K.length; i++) {
    const p1k = PRESETS_1K[i]
    const p2k = PRESETS_2K[i]
    if (p2k.width >= min && p2k.width <= max && p2k.height >= min && p2k.height <= max) {
      presets.push(p2k)
    } else if (p1k.width >= min && p1k.width <= max && p1k.height >= min && p1k.height <= max) {
      presets.push(p1k)
    }
  }
  return presets
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
  }>(),
  { disabled: false, min: 256, max: 2048 }
)

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

function parseSize(v: string): { w: number; h: number } {
  const parts = v.split('*')
  if (parts.length === 2) {
    const w = parseInt(parts[0], 10)
    const h = parseInt(parts[1], 10)
    if (!isNaN(w) && !isNaN(h)) return { w, h }
  }
  return { w: 1024, h: 1024 }
}

const current = computed(() => parseSize(props.modelValue || '1024*1024'))
const widthInput = ref(current.value.w)
const heightInput = ref(current.value.h)

watch(
  () => props.modelValue,
  (val) => {
    const parsed = parseSize(val || '1024*1024')
    widthInput.value = parsed.w
    heightInput.value = parsed.h
  }
)

const clamp = (n: number) => Math.min(props.max, Math.max(props.min, n))

const availablePresets = computed(() => generatePresets(props.min, props.max))
function isCurrentPreset(w: number, h: number) {
  return current.value.w === w && current.value.h === h
}

function handlePreset(w: number, h: number) {
  widthInput.value = w
  heightInput.value = h
  emit('update:modelValue', `${w}*${h}`)
}

function handleSwap() {
  const { w, h } = current.value
  widthInput.value = h
  heightInput.value = w
  emit('update:modelValue', `${h}*${w}`)
}

function commitWidth() {
  const w = clamp(widthInput.value || props.min)
  widthInput.value = w
  emit('update:modelValue', `${w}*${current.value.h}`)
}

function commitHeight() {
  const h = clamp(heightInput.value || props.min)
  heightInput.value = h
  emit('update:modelValue', `${current.value.w}*${h}`)
}
</script>

<template>
  <div class="space-y-3">
    <!-- Preset buttons -->
    <div class="flex flex-wrap gap-1">
      <Button
        v-for="preset in availablePresets"
        :key="`${preset.width}x${preset.height}`"
        size="small"
        :outlined="!isCurrentPreset(preset.width, preset.height)"
        :severity="isCurrentPreset(preset.width, preset.height) ? undefined : 'secondary'"
        :disabled="disabled"
        :title="`${preset.width}×${preset.height}`"
        class="h-6 px-1.5 text-xs"
        @click="handlePreset(preset.width, preset.height)"
      >
        {{ preset.label }}
      </Button>
    </div>

    <!-- Width / swap / height -->
    <div class="flex items-end gap-2">
      <div class="flex-1">
        <p class="text-xs text-muted mb-1">Width</p>
        <InputNumber
          v-model="widthInput"
          :min="min"
          :max="max"
          :step="64"
          :disabled="disabled"
          input-class="w-full"
          class="w-full"
          @blur="commitWidth"
        />
      </div>

      <Button
        text
        severity="secondary"
        size="small"
        :disabled="disabled"
        title="Swap width and height"
        class="mb-0.5"
        @click="handleSwap"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M8 3L4 7l4 4" />
          <path d="M4 7h16" />
          <path d="M16 21l4-4-4-4" />
          <path d="M20 17H4" />
        </svg>
      </Button>

      <div class="flex-1">
        <p class="text-xs text-muted mb-1">Height</p>
        <InputNumber
          v-model="heightInput"
          :min="min"
          :max="max"
          :step="64"
          :disabled="disabled"
          input-class="w-full"
          class="w-full"
          @blur="commitHeight"
        />
      </div>
    </div>

    <!-- Info -->
    <div class="flex items-center justify-between text-xs text-muted">
      <span>{{ current.w }} × {{ current.h }} px</span>
      <span>Range: {{ min }}–{{ max }}</span>
    </div>
  </div>
</template>
