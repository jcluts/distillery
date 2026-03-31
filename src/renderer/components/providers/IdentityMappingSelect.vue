<script setup lang="ts">
import { computed, ref } from 'vue'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import Select from 'primevue/select'

import { useModelBrowsingStore } from '@/stores/model-browsing'

const props = defineProps<{
  providerId: string
  modelId: string
  currentIdentityId?: string
}>()

const NONE_VALUE = '__none__'
const CREATE_VALUE = '__create__'

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

const browsingStore = useModelBrowsingStore()

const showCreate = ref(false)
const newName = ref('')
const derivedId = computed(() => slugify(newName.value))

const options = computed(() => [
  { label: 'No identity', value: NONE_VALUE },
  ...browsingStore.identities.map((id) => ({ label: id.name, value: id.id })),
  { label: '+ Create new…', value: CREATE_VALUE }
])

const selectedValue = computed({
  get: () => props.currentIdentityId ?? NONE_VALUE,
  set: (val: string) => {
    if (val === CREATE_VALUE) {
      newName.value = ''
      showCreate.value = true
      return
    }
    if (val === NONE_VALUE) return
    void browsingStore.setModelIdentity(props.providerId, props.modelId, val)
  }
})

async function handleCreate(): Promise<void> {
  const name = newName.value.trim()
  if (!name || !derivedId.value) return
  try {
    await window.api.identities.create(derivedId.value, name, '', {
      providerId: props.providerId,
      modelIds: [props.modelId]
    })
    await browsingStore.loadIdentities()
    await browsingStore.setModelIdentity(props.providerId, props.modelId, derivedId.value)
    showCreate.value = false
    newName.value = ''
  } catch {
    // ignore
  }
}
</script>

<template>
  <Select
    v-model="selectedValue"
    :options="options"
    option-label="label"
    option-value="value"
    placeholder="Link identity…"
    class="!w-[140px] text-xs"
  />

  <Dialog
    v-model:visible="showCreate"
    header="Create Model Identity"
    modal
    :style="{ width: '400px' }"
    :closable="true"
  >
    <p class="mb-3 text-sm text-muted">
      A model identity groups the same model across different providers.
    </p>

    <div class="space-y-3">
      <div class="space-y-1.5">
        <label class="text-xs font-medium uppercase text-muted">Name</label>
        <InputText
          v-model="newName"
          placeholder="e.g. Flux 2 Klein 9B"
          class="w-full"
          autofocus
          @keydown.enter="newName.trim() ? handleCreate() : undefined"
        />
      </div>
      <p v-if="derivedId" class="text-xs text-muted">
        ID: <span class="font-mono">{{ derivedId }}</span>
      </p>
    </div>

    <template #footer>
      <Button text severity="secondary" size="small" label="Cancel" @click="showCreate = false" />
      <Button
        size="small"
        label="Create"
        :disabled="!newName.trim() || !derivedId"
        @click="handleCreate"
      />
    </template>
  </Dialog>
</template>
