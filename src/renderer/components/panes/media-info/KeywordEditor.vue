<script setup lang="ts">
import { ref } from 'vue'
import { Icon } from '@iconify/vue'
import Tag from 'primevue/tag'
import InputText from 'primevue/inputtext'

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
      <Tag
        v-for="kw in keywords"
        :key="kw"
        severity="secondary"
      >
        {{ kw }}
        <button
          v-if="!hideRemove"
          type="button"
          class="ml-1 rounded-sm p-0.5 opacity-60 transition-opacity hover:opacity-100"
          :aria-label="`Remove keyword ${kw}`"
          @click="emit('remove', kw)"
        >
          <Icon icon="lucide:x" class="size-3" />
        </button>
      </Tag>
    </div>
    <InputText
      v-model="inputValue"
      placeholder="Add keyword…"
      size="small"
      class="w-full"
      @keydown="handleKeyDown"
      @blur="handleBlur"
    />
  </div>
</template>
