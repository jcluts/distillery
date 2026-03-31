<script setup lang="ts">
const DIMENSIONS: Record<string, { w: number; h: number }> = {
  '1:1': { w: 10, h: 10 },
  '16:9': { w: 12, h: 7 },
  '9:16': { w: 7, h: 12 },
  '4:3': { w: 12, h: 9 },
  '3:4': { w: 9, h: 12 },
  '3:2': { w: 12, h: 8 },
  '2:3': { w: 8, h: 12 },
  '4:5': { w: 10, h: 12 },
  '5:4': { w: 12, h: 10 },
  '21:9': { w: 14, h: 6 },
  '9:21': { w: 6, h: 14 }
}

const props = defineProps<{ ratio: string }>()

const dim = DIMENSIONS[props.ratio] ?? { w: 10, h: 10 }
</script>

<template>
  <div
    class="rounded-[1px] border border-current"
    :style="{ width: `${dim.w}px`, height: `${dim.h}px` }"
  />
</template>
