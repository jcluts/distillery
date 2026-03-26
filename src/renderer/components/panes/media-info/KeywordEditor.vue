<script setup lang="ts">
import { ref } from 'vue'

const props = defineProps<{
  keywords: string[]
  hideRemove?: boolean
}>()

const emit = defineEmits<{
  add: [keyword: string]
  remove: [keyword: string]
}>()

const inputValue = ref('')

function addKeyword(): void {
  const keyword = inputValue.value.trim().toLowerCase()
  if (!keyword || props.keywords.includes(keyword)) {
    inputValue.value = ''
    return
  }
  emit('add', keyword)
  inputValue.value = ''
}

function handleKeyDown(e: KeyboardEvent): void {
  if (e.key === 'Enter' || e.key === ',') {
    e.preventDefault()
    addKeyword()
  } else if (e.key === 'Backspace' && inputValue.value === '' && props.keywords.length > 0) {
    emit('remove', props.keywords[props.keywords.length - 1])
  }
}

function handleBlur(): void {
  if (inputValue.value.trim()) addKeyword()
}
</script>

<template>
  <div class="space-y-2">
    <div v-if="keywords.length > 0" class="flex flex-wrap gap-1">
      <UBadge
        v-for="kw in keywords"
        :key="kw"
        color="neutral"
        variant="subtle"
        size="sm"
      >
        {{ kw }}
        <button
          v-if="!hideRemove"
          type="button"
          class="ml-1 rounded-sm p-0.5 opacity-60 transition-opacity hover:opacity-100"
          :aria-label="`Remove keyword ${kw}`"
          @click="emit('remove', kw)"
        >
          <UIcon name="i-lucide-x" class="size-3" />
        </button>
      </UBadge>
    </div>
    <UInput
      v-model="inputValue"
      placeholder="Add keyword…"
      size="xs"
      @keydown="handleKeyDown"
      @blur="handleBlur"
    />
  </div>
</template>
